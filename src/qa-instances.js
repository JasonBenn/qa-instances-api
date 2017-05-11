import { getHostName, getDomainName, underscoreCase, getPipeDataCmd } from './utils'
import { States } from './db'
import Promise from 'bluebird'
import treeKill from 'tree-kill'
import _ from 'underscore'

const DEPLOY_ONLINE_STATES = ["online"]
const DEPLOY_OFFLINE_STATES = ["stopped", "terminated"]
const DEPLOY_ERROR_STATES = ["connection_lost", "setup_failed", "start_failed", "stop_failed"]
// Other AWS deployment states: requested|booting|pending|rebooting|running_setup|shutting_down|stopping|terminating

const MAX_POLL_COUNT = 40
const POLL_STATE_INTERVAL = 5000


export default class QaInstances {
  constructor(db, aws, pubsub) {
    this.db = db
    this.pubsub = pubsub
    this.aws = aws

    this.runningProcesses = {}
  }

  // TODO: check that states starting, online are triggered properly for the correct States.
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
      let startInstancePromise = new Promise(() => {}) // Never resolves, but will be reassigned soon.
      let instanceId

      // // createDB, updates dbState.
      // const dbPromise = new Promise((resolve, reject) => {
      //   this.pubsub.saveThenPublish(prId, { dbState: States.Starting, dbName: dbName })

      //   this.aws.createDB(dbName).then(proc => {
      //     this.runningProcesses.createDB = proc
      //     proc.stderr.on('data', progressUpdate => this.pubsub.publish(prId, { dbProgress: progressUpdate.trim() }))
      //     this.createDBCallback = this.onCreateDBFinish.bind(this, prId, resolve, reject)
      //     proc.on('close', this.createDBCallback)
      //   })
      // })

      const dbPromise = Promise.resolve()
      this.pubsub.saveThenPublish(prId, { dbState: States.Online, dbName: dbName })

      // createInstance, updates instanceState.
      this.pubsub.saveThenPublish(prId, { instanceState: States.Starting })
      const createInstancePromise = this.aws.createInstance(prId, hostName).then(({ InstanceId }) => {
        instanceId = InstanceId
        this.pubsub.saveThenPublish(prId, { instanceState: States.Online, instanceId })
      })

      // startInstance, updates startInstanceState.
      createInstancePromise.then(() => {
        this.pubsub.saveThenPublish(prId, { startInstanceState: States.Starting })
        startInstancePromise = new Promise((resolve, reject) => {
          this.aws.startInstance(instanceId).then(() => {
            console.log("qai: startInstance callback args:", arguments)
            this.pollInstanceState({ prId, resolve, reject, uiType: "startInstance", instanceId, ignoreFirstState: "offline" })
          })
        })
      })

      Promise.all([dbPromise, startInstancePromise]).then(() => {

        // createRoute53Record, updates route53State.
        this.pubsub.saveThenPublish(prId, { route53State: States.Starting })
        const route53Promise = this.aws.createRoute53Record(prId, domainName, instanceIp).then(({ url }) => {
          // TODO: check if URL is present in params.
          console.log("qai: createRoute53Record callback args:", arguments)
          this.pubsub.saveThenPublish(prId, { route53State: States.Online, url })
        })

        // deployInstance, updates deployInstanceState.
        this.pubsub.saveThenPublish(prId, { deployInstanceState: States.Starting })
        const deployInstancePromise = new Promise((resolve, reject) => {
          this.aws.deployInstance({ instanceId, domainName, dbName }).then(() => {
            // How do I keep up to date with a deployment?
            this.pollInstanceState({ prId, resolve, reject, uiType: "deployInstance", instanceId, ignoreFirstState: "offline" })
          })
        })

        Promise.all([route53Promise, deployInstancePromise]).then(() => {

          // serviceInstance, updates serviceInstanceState.
          this.pubsub.saveThenPublish(prId, { serviceInstanceState: States.Starting })
          const serviceInstancePromise = new Promise((resolve, reject) => {
            this.aws.serviceInstance({ instanceId, domainName, dbName }).then(() => {
              console.log('qai: serviceInstance callback args:', arguments)
              // TODO: how do I resolve this promise? Will I need http://docs.aws.amazon.com/cli/latest/reference/deploy/get-deployment.html
              // to get info about a running deployment?
            })
          })

          // Finally, after serviceInstance, update overallState.
          serviceInstancePromise.then(() => {
            this.pubsub.saveThenPublish(prId, { overallState: States.Online })
          })
        })
      })
    })
  }

  onCreateDBFinish(prId, resolve, reject, code) {
    delete this.runningProcesses.createDB
    if (code === 0) {
      this.pubsub.saveThenPublish(prId, { dbState: States.Online })
      resolve()
    } else {
      this.pubsub.saveThenPublish(prId, { dbState: States.Error, dbError: `exit code ${code}` })
      reject()
    }
  }

  delete(prId) {
    console.log("qai: delete");

    // Kill any running instance creation processes.
    _.each(this.runningProcesses, (proc, key) => {
      if (key === 'createDB') proc.removeListener('close', this.createDBCallback)
      treeKill(proc.pid)
    })

    this.pubsub.saveThenPublish(prId, { 
      overallState: States.Stopping,

      overallError: null,
      // These states don't make sense in the context of stopping, so set them Offline.
      deployInstanceState: States.Offline,
      deployInstanceError: null,
      startInstanceState: States.Offline,
      startInstanceError: null,
      serviceInstanceState: States.Offline,
      serviceInstanceError: null
    })

    this.db.get(prId).then(({ instanceId, domainName, instanceIp, dbName }) => {

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
          console.log("qai: stopInstance callback args:", arguments);
          // Shoot, what is its state going to be here?
          // DANG, that's confusing. Instance State is apparently "online" when it's created - but "online" really means it's running. DAMN DAMN DAMN. I want "online" to mean running, which only happens after serviceInstance.
          // instanceState: Online could correspond to "Created". deployState: "online" could correspond to Deployed. serviceInstance: "online" could correspond to running. overallState: "online" could correspond to "running".
          // TODO: Stopping view: it really only makes sense to display state of overallState, dbState, instanceState, route53State.
          this.pollInstanceState({ prId, resolve, reject, uiType: "instanceState", instanceId, ignoreFirstState: "online" })
        })
      })

      // deleteRoute53Record, updates route53State.
      this.pubsub.saveThenPublish(prId, { route53State: States.Stopping, route53Error: null })
      const route53Promise = this.aws.deleteRoute53Record(prId, domainName, instanceIp).then(() => {
        this.pubsub.saveThenPublish(prId, { route53State: States.Offline, url: null })
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

  pollInstanceState({ prId, resolve, reject, uiType, instanceId, ignoreFirstState = "", pollCount = 0, oldStatus = "" }) {
    console.log("qai: pollInstanceState for", uiType);
    pollCount += 1

    this.aws.describeInstances(instanceId).then(data => {
      const status = data.Instances[0].Status
      console.log('qai: pollInstanceState', status);
      const timedOut = pollCount === MAX_POLL_COUNT

      // Is this a state we're temporarily ignoring, like "offline" when we _just_ triggered a deploy? If so, recurse.
      if (ignoreFirstState === status && !timedOut) {
        setTimeout(this.pollInstanceState.bind(this, { prId, resolve, reject, uiType, instanceId, ignoreFirstState, pollCount, status }), POLL_STATE_INTERVAL)

      } else {
        // Are we online?
        if (DEPLOY_ONLINE_STATES.includes(status)) {
          this.pubsub.saveThenPublish(prId, { [uiType + "State"]: States.Online })
          resolve()

        // Are we offline?
        } else if (DEPLOY_OFFLINE_STATES.includes(status)) {
          this.pubsub.saveThenPublish(prId, { [uiType + "State"]: States.Offline })
          resolve()

        // Are we in an error state?
        } else if (DEPLOY_ERROR_STATES.includes(status)) {
          this.pubsub.saveThenPublish(prId, { [uiType + "State"]: States.Error, [uiType + "Error"]: status })
          reject()

        // Have we timed out?
        } else if (timedOut) {
          this.pubsub.saveThenPublish(prId, { [uiType + "State"]: States.Error, [uiType + "Error"]: "timed out" })
          reject()

        // If none of the above, recurse.
        } else {

          // Also, if this is a new state, publish a progress update.
          if (status !== oldStatus) {
            this.pubsub.publish(prId, { [uiType + "Progress"]: status })
          }

          setTimeout(this.pollInstanceState.bind(this, { prId, resolve, reject, uiType, instanceId, pollCount, status }), POLL_STATE_INTERVAL)
        }
      }
    })

  }

}
