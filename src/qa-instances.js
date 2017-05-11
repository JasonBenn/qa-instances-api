import { getHostName, getDomainName, underscoreCase, getPipeDataCmd } from './utils'
import { States } from './db'
import Promise from 'bluebird'
import treeKill from 'tree-kill'
import _ from 'underscore'

const DEPLOY_INSTANCE_ONLINE_STATES = ["online"]
const DEPLOY_INSTANCE_OFFLINE_STATES = ["stopped", "terminated"]
const DEPLOY_INSTANCE_ERROR_STATES = ["connection_lost", "setup_failed", "start_failed", "stop_failed"]
// Other AWS deployment states: requested|booting|pending|rebooting|running_setup|shutting_down|stopping|terminating
const DEPLOYMENT_ONLINE = "successful"
const DEPLOYMENT_ERROR = "failed"

const MAX_POLL_INSTANCE_COUNT = 120  // 10 minutes
const MAX_POLL_DEPLOYMENT_COUNT = 120  // 10 minutes
const POLL_STATE_INTERVAL = 5000


export default class QaInstances {
  constructor(db, aws, pubsub) {
    this.db = db
    this.pubsub = pubsub
    this.aws = aws

    this.runningProcesses = {}
  }

  create(prId, sha, prName) {
    console.log("qai: create");

    const hostName = getHostName(prName)
    const domainName = getDomainName(hostName)

    return this.db.create({
      prId: prId,
      sha: sha,
      prName: prName,
      hostName: hostName,
      domainName: domainName,
      overallState: States.Starting
    }).then(() => {

      const dbName = underscoreCase(prName)
      let instanceId
      this.runningProcesses[prId] = {}

      // createDB, updates dbState.
      const dbPromise = new Promise((resolve, reject) => {
        this.pubsub.saveThenPublish(prId, { dbState: States.Starting, dbName: dbName })

        this.aws.createDB(dbName).then(proc => {
          this.runningProcesses[prId].createDB = proc
          proc.stderr.on('data', progressUpdate => this.pubsub.publish(prId, { dbProgress: progressUpdate.trim() }))
          this.createDBCallback = this.onCreateDBFinish.bind(this, prId, resolve, reject)
          proc.on('close', this.createDBCallback)
        })
      })

      // createInstance, updates instanceState.
      this.pubsub.saveThenPublish(prId, { instanceState: States.Starting })
      const createInstancePromise = this.aws.createInstance(hostName).then(({ InstanceId }) => {
        instanceId = InstanceId
        this.pubsub.saveThenPublish(prId, { instanceState: States.Online, instanceId: InstanceId })
      })

      // startInstance, updates startInstanceState.
      createInstancePromise.then(() => {
        this.pubsub.saveThenPublish(prId, { startInstanceState: States.Starting })
        const startInstancePromise = new Promise((resolve, reject) => {
          this.aws.startInstance(instanceId).then(() => {
            this.pollInstanceState({ prId, resolve, reject, instanceId, ignoreFirstState: "offline" })

            // createRoute53Record, updates route53State.
            this.pollForPublicIp(prId, instanceId, domainName)
          })
        })

        startInstancePromise.then(() => {

          // deployInstance, updates deployInstanceState.
          this.pubsub.saveThenPublish(prId, { deployInstanceState: States.Starting })
          const deployInstancePromise = new Promise((resolve, reject) => {
            this.aws.deployInstance({ instanceId, domainName, dbName }).then(({ DeploymentId }) => {
              this.pollDeploymentState({ prId, resolve, reject, uiType: "deployInstance", deploymentId: DeploymentId })
            })
          })

          Promise.all([dbPromise, deployInstancePromise]).then(() => {

            // serviceInstance, updates serviceInstanceState.
            this.pubsub.saveThenPublish(prId, { serviceInstanceState: States.Starting })
            const serviceInstancePromise = new Promise((resolve, reject) => {
              this.aws.serviceInstance({ instanceId, domainName, dbName }).then(({ DeploymentId }) => {
                this.pollDeploymentState({ prId, resolve, reject, uiType: "serviceInstance", deploymentId: DeploymentId })
              })
            })

            // Finally, after serviceInstance, update overallState.
            serviceInstancePromise.then(() => {
              this.pubsub.saveThenPublish(prId, { overallState: States.Online })
            })
          })
        })

      })

    })
  }

  pollForPublicIp(prId, instanceId, domainName) {
    console.log("qai: pollForPublicIp")
    this.aws.describeInstance(instanceId).then(data => {
      const publicIp = data.Instances[0].PublicIp
      if (publicIp) {
        this.pubsub.saveThenPublish(prId, { route53State: States.Starting, publicIp: publicIp })
        this.aws.createRoute53Record(domainName, publicIp).then(() => {
          this.pubsub.saveThenPublish(prId, { route53State: States.Online })
        })
      } else {
        setTimeout(this.pollForPublicIp.bind(this, prId, instanceId, domainName), POLL_STATE_INTERVAL)
      }
    })
  }

  onCreateDBFinish(prId, resolve, reject, code) {
    delete this.runningProcesses[prId].createDB
    if (code === 0) {
      this.pubsub.saveThenPublish(prId, { dbState: States.Online })
      resolve()
    } else {
      this.pubsub.saveThenPublish(prId, { overallState: States.Error, dbState: States.Error, dbError: `exit code ${code}` })
      reject()
    }
  }

  delete(prId) {
    console.log("qai: delete");

    // Kill any running instance creation processes.
    _.each(this.runningProcesses[prId], (proc, key) => {
      if (key === 'createDB') proc.removeListener('close', this.createDBCallback)
      treeKill(proc.pid)
    })

    this.pubsub.saveThenPublish(prId, { 
      overallState: States.Stopping,

      overallError: null,
      // These states don't make sense in the context of stopping, so reset them.
      deployInstanceState: States.Offline,
      deployInstanceError: null,
      startInstanceState: States.Offline,
      startInstanceError: null,
      serviceInstanceState: States.Offline,
      serviceInstanceError: null
    })

    this.db.get(prId).then(({ instanceId, domainName, publicIp, dbName }) => {

      // deleteDB, updates dbState.
      const deleteDBPromise = this.aws.deleteDB(dbName).then(proc => {
        this.pubsub.saveThenPublish(prId, { dbState: States.Stopping, dbError: null })
        proc.on('close', () => {
          this.pubsub.saveThenPublish(prId, { dbState: States.Offline, dbName: null })
        })
      })

      // stopInstance, updates instanceState.
      this.pubsub.saveThenPublish(prId, { instanceState: States.Stopping, instanceError: null })
      const stopInstancePromise = new Promise((resolve, reject) => {
        this.aws.stopInstance(instanceId).then(() => {
          this.pollInstanceState({ prId, resolve, reject, instanceId, ignoreFirstState: "online" })
        })
      })

      // deleteRoute53Record, updates route53State.
      this.pubsub.saveThenPublish(prId, { route53State: States.Stopping, route53Error: null })
      const route53Promise = this.aws.deleteRoute53Record(domainName, publicIp).then(() => {
        this.pubsub.saveThenPublish(prId, { route53State: States.Offline, publicIp: null })
      })

      Promise.all([deleteDBPromise, stopInstancePromise, route53Promise]).then(() => {

        // deleteInstance, updates overallState.
        this.aws.deleteInstance(instanceId).then(() => {
          this.pubsub.publish(prId, { overallState: States.Offline })
          this.db.delete(prId)
        })
      })
    })
  }

  pollInstanceState({ prId, resolve, reject, instanceId, ignoreFirstState = "", pollCount = 0, oldStatus = "" }) {
    console.log("qai: pollInstanceState", pollCount, "status:", oldStatus);
    pollCount += 1

    this.aws.describeInstance(instanceId).then(data => {
      const status = data.Instances[0].Status
      const timedOut = pollCount === MAX_POLL_INSTANCE_COUNT

      // Is this a state we're temporarily ignoring, like "offline" when we _just_ triggered a deploy? If so, recurse.
      if (ignoreFirstState === status && !timedOut) {
        setTimeout(this.pollInstanceState.bind(this, { prId, resolve, reject, instanceId, ignoreFirstState, pollCount, oldStatus: status }), POLL_STATE_INTERVAL)

      } else {
        // Are we online?
        if (DEPLOY_INSTANCE_ONLINE_STATES.includes(status)) {
          this.pubsub.saveThenPublish(prId, { startInstanceState: States.Online })
          resolve()

        // Are we offline?
        } else if (DEPLOY_INSTANCE_OFFLINE_STATES.includes(status)) {
          this.pubsub.saveThenPublish(prId, { startInstanceState: States.Offline })
          resolve()

        // Are we in an error state?
        } else if (DEPLOY_INSTANCE_ERROR_STATES.includes(status)) {
          this.pubsub.saveThenPublish(prId, { overallState: States.Error, startInstanceState: States.Error, startInstanceError: status })
          reject()

        // Have we timed out?
        } else if (timedOut) {
          this.pubsub.saveThenPublish(prId, { overallState: States.Error, startInstanceState: States.Error, startInstanceError: "timed out" })
          reject()

        // If none of the above, recurse.
        } else {

          // Also, if this is a new state, publish a progress update.
          if (status !== oldStatus) {
            pollCount = 0
            this.pubsub.publish(prId, { startInstanceProgress: status })
          }

          setTimeout(this.pollInstanceState.bind(this, { prId, resolve, reject, instanceId, pollCount, oldStatus: status }), POLL_STATE_INTERVAL)
        }
      }
    })

  }

  pollDeploymentState({ prId, resolve, reject, uiType, deploymentId, pollCount = 0 }) {
    console.log("qai: pollDeploymentState for", uiType, pollCount);
    pollCount += 1

    this.aws.describeDeployment(deploymentId).then(data => {
      const status = data.Deployments[0].Status
      const timedOut = pollCount === MAX_POLL_DEPLOYMENT_COUNT

      // Are we online?
      if (status === DEPLOYMENT_ONLINE) {
        this.pubsub.saveThenPublish(prId, { [uiType + "State"]: States.Online })
        resolve()

      // Are we in an error state?
      } else if (status === DEPLOYMENT_ERROR) {
        this.pubsub.saveThenPublish(prId, { overallState: States.Error, [uiType + "State"]: States.Error, [uiType + "Error"]: "recipe failed" })
        reject()

      // Have we timed out?
      } else if (timedOut) {
        this.pubsub.saveThenPublish(prId, { overallState: States.Error, [uiType + "State"]: States.Error, [uiType + "Error"]: "timed out" })
        reject()

      // If none of the above, recurse.
      } else {
        setTimeout(this.pollDeploymentState.bind(this, { prId, resolve, reject, uiType, deploymentId, pollCount }), POLL_STATE_INTERVAL)
      }

    })

  }

}
