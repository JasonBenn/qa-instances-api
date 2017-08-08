import { getDomainName, getHostName, underscoreCase, getPipeDataCmd } from './utils'
import { States } from './db'
import Promise from 'bluebird'
import treeKill from 'tree-kill'
import _ from 'underscore'
import StringDecoder from 'string_decoder'

const DEPLOY_INSTANCE_ONLINE_STATES = ["online"]
const DEPLOY_INSTANCE_OFFLINE_STATES = ["stopped", "terminated"]
const DEPLOY_INSTANCE_ERROR_STATES = ["connection_lost", "setup_failed", "start_failed", "stop_failed"]
// Other AWS deployment states: requested|booting|pending|rebooting|running_setup|shutting_down|stopping|terminating
const DEPLOYMENT_ONLINE = "successful"
const DEPLOYMENT_ERROR = "failed"

const MAX_POLL_INSTANCE_COUNT = 240  // 20 minutes
const MAX_POLL_DEPLOYMENT_COUNT = 120  // 10 minutes
const MAX_POLL_LOG_FILENAME_COUNT = 10
const POLL_STATE_INTERVAL = 5000

// The number of (0-indexed) authorized JavaScript OAuth origins in Google Cloud Platform.
// All 25 of the URLs are of the form "https://qa0.minervaproject.com".
const URLS_POOL_SIZE = 25


export default class QaInstances {
  constructor(config, db, aws, pubsub) {
    this.config = config
    this.db = db
    this.pubsub = pubsub
    this.aws = aws

    this.runningProcesses = {}
  }

  create(prId, sha, prName) {
    console.log("qai: create", prId, sha, prName);

    return this.db.getLowestAvailableId().then(id => {
      const dbName = underscoreCase(prName)
      const hostName = this.allocateHostName(id)
      const domainName = getDomainName(hostName)

      this.db.create({ id, prId }).then(() => {
        this.pubsub.saveThenPublish(prId, { prId, sha, prName, hostName, domainName, overallState: States.Starting }).then(() => {
          this.runningProcesses[prId] = this.runningProcesses[prId] || {}

          const dbPromise = this.createDB({ prId, dbName })
          const createInstancePromise = this.createInstance({ prId, hostName })

          createInstancePromise.then(({ instanceId }) => {
            console.log("qai: createInstancePromise.then resolved with", instanceId)

            this.startInstance({ prId, instanceId, domainName }).then(() => {
              this.pollForIpThenCreateRoute53Record({ prId, instanceId, domainName })

              const deployInstancePromise = this.deployInstance({ prId, instanceId, hostName, domainName, dbName, prName })

              Promise.all([dbPromise, deployInstancePromise]).then(() => {
                this.serviceInstance({ prId, instanceId, hostName, domainName, dbName, prName }).then(() => {
                  this.pubsub.saveThenPublish(prId, { overallState: States.Online })
                })
              })
            })

          })

        })

      })
    })

  }

  createDB({ prId, dbName }) {
    console.log("qai: createDB", { prId, dbName })
    this.pubsub.saveThenPublish(prId, { dbState: States.Starting, dbName: dbName })
    return new Promise((resolve, reject) => {
      this.aws.createDB(dbName).then(proc => {
        this.runningProcesses[prId] = this.runningProcesses[prId] || {}
        this.runningProcesses[prId].createDB = proc
        proc.stderr.on('data', progressUpdate => this.pubsub.publish(prId, { dbProgress: progressUpdate.trim() }))
        this.createDBCallback = this.onCreateDBFinish.bind(this, prId, resolve, reject)
        proc.on('close', this.createDBCallback)
      })
    })
  }

  updateDB(prId) {
    this.pubsub.saveThenPublish(prId, { dbState: States.Starting, overallState: States.Starting })
    return this.db.get(prId).then(({ instanceId, dbName, prName }) => {
      this.deleteDB({ prId, dbName }).then(() => {
        this.createDB({ prId, dbName })
      })
    })
  }

  createInstance({ prId, hostName }) {
    console.log("qai: createInstance", { prId, hostName })
    this.pubsub.saveThenPublish(prId, { instanceState: States.Starting })
    return new Promise((resolve, reject) => {
      this.aws.createInstance(hostName).then(({ InstanceId }) => {
        console.log('qai: this.aws.createInstance resolved with', InstanceId)
        this.pubsub.saveThenPublish(prId, { instanceState: States.Online, instanceId: InstanceId })
        resolve({ instanceId: InstanceId })
      })
    })
  }

  startInstance({ prId, instanceId, domainName }) {
    console.log("qai: startInstance", { prId, instanceId, domainName })
    this.pubsub.saveThenPublish(prId, { startInstanceState: States.Starting })
    return new Promise((resolve, reject) => {
      this.aws.startInstance(instanceId).then(() => {
        this.pollInstanceState({ prId, resolve, reject, instanceId, ignoreFirstState: "offline" })
      })
    })
  }

  createRoute53Record({ prId, domainName, publicIp }) {
    console.log("qai: createRoute53Record", { prId, domainName, publicIp })
    this.pubsub.saveThenPublish(prId, { route53State: States.Starting, publicIp: publicIp })
    return this.aws.createRoute53Record(domainName, publicIp).then(() => {
      this.pubsub.saveThenPublish(prId, { route53State: States.Online })
    })
  }

  deployInstance({ prId, instanceId, hostName, domainName, dbName, prName }) {
    console.log("qai: deployInstance", { prId, instanceId, hostName, domainName, dbName, prName })
    this.pubsub.saveThenPublish(prId, { deployInstanceState: States.Starting })
    return new Promise((resolve, reject) => {
      this.aws.deployInstance({ prId, instanceId, domainName, dbName, prName }).then(({ DeploymentId }) => {
        const uiType = "deployInstance"
        this.pollDeploymentState({ prId, resolve, reject, uiType, deploymentId: DeploymentId })
        this.getAndTailOpsworksLog({ prId, hostName, uiType })
      })
    })
  }

  serviceInstance({ prId, instanceId, hostName, domainName, dbName, prName }) {
    console.log("qai: serviceInstance", { prId, instanceId, hostName, domainName, dbName, prName })
    this.pubsub.saveThenPublish(prId, { serviceInstanceState: States.Starting })
    return new Promise((resolve, reject) => {
      this.aws.serviceInstance({ instanceId, domainName, dbName, prName }).then(({ DeploymentId }) => {
        const uiType = "serviceInstance"
        this.pollDeploymentState({ prId, resolve, reject, uiType, deploymentId: DeploymentId })
        this.getAndTailOpsworksLog({ prId, hostName, uiType })
      })
    })
  }

  redeploy(prId, sha) {
    this.pubsub.saveThenPublish(prId, { overallState: States.Starting })
    console.log("qai: redeploy", prId)
    return this.db.get(prId).then(({ instanceId, hostName, domainName, dbName, prName }) => {
      this.pubsub.saveThenPublish(prId, { deployInstanceLogFile: null })
      this.deployInstance({ prId, instanceId, hostName, domainName, dbName, prName }).then(() => {
        this.pubsub.saveThenPublish(prId, { sha: sha, serviceInstanceState: States.Offline, serviceInstanceLogFile: null })
        this.serviceInstance({ prId, instanceId, hostName, domainName, dbName, prName }).then(() => {
          this.pubsub.saveThenPublish(prId, { overallState: States.Online })
        })
      })
    })
  }

  allocateHostName(id) {
    if (id <= URLS_POOL_SIZE) {
      return "qa" + id
    } else {
      throw "Not enough instance URLs allocated! Add more authorized JS origins in Google Cloud Platform."
    }
  }

  getAndTailOpsworksLog({ prId, hostName, uiType }) {
    console.log("qai: getAndTailOpsworksLogs", prId, hostName, uiType)

    const filenamePromise = new Promise((resolve, reject) => {
      this.pollForOpsworksFilename({ prId, uiType, hostName, resolve, reject })
    })

    filenamePromise.catch(err => {
      this.pubsub.saveThenPublish(prId, { overallState: States.Error, [uiType + "State"]: States.Error, [uiType + "Error"]: err })
    })

    filenamePromise.then(filename => {
      this.pubsub.saveThenPublish(prId, { [uiType + 'LogFile']: filename })
      const proc = this.aws.tailOpsworksLog(hostName, filename)

      this.runningProcesses[prId] = this.runningProcesses[prId] || {}
      this.runningProcesses[prId][uiType + "Log"] = proc

      proc.stdout.on('data', chunk => {
        const progressUpdate = chunk.toString('utf8')
        this.pubsub.publish(prId, { [uiType + "Log"]: progressUpdate.trim() })
      })
    })

    // What do I return? How is this killed?
  }

  maybeSendLog({ prId, hostName, deployInstanceState, deployInstanceLogFile, serviceInstanceState, serviceInstanceLogFile }) {
    console.log("qai: maybeSendLog")
    if (deployInstanceState && deployInstanceState === States.Error || deployInstanceState === States.Starting) {
      this.aws.getOpsworksLog(hostName, deployInstanceLogFile).then(logs => {
        this.pubsub.publish(prId, { deployInstanceLog: logs })
      })
    }
    if (serviceInstanceState && serviceInstanceState === States.Error || serviceInstanceState === States.Starting) {
      this.aws.getOpsworksLog(hostName, serviceInstanceLogFile).then(logs => {
        this.pubsub.publish(prId, { serviceInstanceLog: logs })
      })
    }
  }

  getLogs(prId) {
    return new Promise((resolve, reject) => {
      this.db.get(prId).then(({ hostName, deployInstanceState, serviceInstanceState, deployInstanceLogFile, serviceInstanceLogFile }) => {
        if (deployInstanceState === States.Error) {
          this.aws.getOpsworksLog(hostName, deployInstanceLogFile).then(logs => {
            resolve({ deployInstanceLog: logs })
          })
        } else if (serviceInstanceState === States.Error) {
          this.aws.getOpsworksLog(hostName, serviceInstanceLogFile).then(logs => {
            resolve({ serviceInstanceLog: logs })
          })
        } else {
          resolve()
        }
      })
    })
  }

  pollForOpsworksFilename({ prId, uiType, hostName, resolve, reject, pollCount = 0 }) {
    this.pubsub.publish(prId, { [uiType + "State"]: States.Starting, [uiType + "Progress"]: `waiting for opsworks log... (${pollCount})` })
    console.log("qai: pollForOpsworksFilename", pollCount)
    this.aws.getOpsworksProcess(hostName).then(stdout => {
      const lineContainingTee = /tee -a (.*)$/m.exec(stdout)
      if (lineContainingTee) {
        this.pubsub.publish(prId, { [uiType + "Progress"]: "" })  // clear "polling..." message.
        const filename = lineContainingTee[1]
        resolve(filename)
      } else if (pollCount >= MAX_POLL_LOG_FILENAME_COUNT) {
        reject("timed out waiting for opsworks logfile")
      } else {
        setTimeout(this.pollForOpsworksFilename.bind(this, { prId, uiType, hostName, resolve, reject, pollCount: pollCount + 1 }), POLL_STATE_INTERVAL)
      }
    })
  }

  pollForIpThenCreateRoute53Record({ prId, instanceId, domainName }) {
    console.log("qai: pollForIpThenCreateRoute53Record", { prId, instanceId, domainName })
    this.aws.describeInstance(instanceId).then(data => {
      const publicIp = data.Instances[0].PublicIp
      if (publicIp) {
        this.createRoute53Record({ prId, domainName, publicIp })
      } else {
        setTimeout(this.pollForIpThenCreateRoute53Record.bind(this, { prId, instanceId, domainName }), POLL_STATE_INTERVAL)
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

    if (this.config.local) this.aws.mockAwsDeletion()

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

      const deleteDBPromise = this.deleteDB({ prId, dbName })

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

  deleteDB({ prId, dbName }) {
    return this.aws.deleteDB(dbName).then(proc => {
      this.pubsub.saveThenPublish(prId, { dbState: States.Stopping, dbError: null })
      proc.on('close', () => {
        this.pubsub.saveThenPublish(prId, { dbState: States.Offline, dbName: null })
      })
    })
  }

  pollInstanceState({ prId, resolve, reject, instanceId, ignoreFirstState = "", pollCount = 0, oldStatus = "" }) {
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
            console.log("qai: pollInstanceState", pollCount, status);
            pollCount = 0
            this.pubsub.publish(prId, { startInstanceProgress: status })
          }

          setTimeout(this.pollInstanceState.bind(this, { prId, resolve, reject, instanceId, pollCount, oldStatus: status }), POLL_STATE_INTERVAL)
        }
      }
    })

  }

  pollDeploymentState({ prId, resolve, reject, uiType, deploymentId, pollCount = 0 }) {
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
