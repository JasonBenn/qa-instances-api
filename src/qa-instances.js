import { getHostName, underscoreCase, getPipeDataCmd } from './utils'
import Promise from 'bluebird'
import treeKill from 'tree-kill'
import _ from 'underscore'

const DEPLOY_ONLINE_STATES = ["online"]
const DEPLOY_OFFLINE_STATES = ["stopped", "terminated"]
const DEPLOY_ERROR_STATES = ["connection_lost", "setup_failed", "start_failed", "stop_failed"]
// Other AWS deployment states: booting|pending|rebooting|requested|running_setup|shutting_down|stopping|terminating

const MAX_POLL_COUNT = 40
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
    return this.db.create({
      prId: prId,
      sha: sha,
      prName: prName,
      hostName: hostName,
      instanceState: "starting",
      deployState: "stopped"
    }).then(() => {
      const dbName = underscoreCase(prName)

      const dbPromise = new Promise((resolve, reject) => {
        this.aws.createDB(dbName).then(proc => {
          this.runningProcesses.createDB = proc

          this.pubsub.saveThenPublish(prId, { dbState: 'starting', dbName: dbName })

          proc.stderr.on('data', progressUpdate => {
            this.pubsub.publish(prId, { createDB: progressUpdate.trim() })
          })

          this.createDBCallback = this.onCreateDBFinish.bind(this, prId, resolve, reject)
          proc.on('close', this.createDBCallback)
        })
      })

      const createInstancePromise = this.aws.createInstance(prId, hostName).then(data => {
        this.db.update(prId, { instanceState: 'starting', instanceId: data.InstanceId })
      })

      // this.aws.deployInstance(instanceId, domainName, dbName)

      Promise.all([dbPromise, createInstancePromise]).then(() => {
        console.log('db and deploy finished, servicing!');
        // this.aws.createRoute53Record(prId, getDomainName(hostName), instanceIp)
        // this.aws.startInstance(instanceId, "stopped")
        // this.pollInstanceState(instanceId, "online")
        // this.aws.startInstanceServices
      })
    })
  }

  onCreateDBFinish(prId, resolve, reject, code) {
    delete this.runningProcesses.createDB
    if (code === 0) {
      this.pubsub.saveThenPublish(prId, { dbState: 'online' })
      resolve()
    } else {
      this.pubsub.saveThenPublish(prId, { dbState: 'error', dbErrorMessage: `exit code ${code}` })
      reject()
    }
  }

  delete(prId) {
    console.log("qai: delete");

    _.each(this.runningProcesses, (proc, key) => {
      if (key === 'createDB') proc.removeListener('close', this.createDBCallback)
      treeKill(proc.pid)
    })

    this.db.get(prId).then(({ instanceId, dbName }) => {
      const deleteDBPromise = this.aws.deleteDB(dbName).then(proc => {
        this.pubsub.saveThenPublish(prId, { dbState: 'stopping' })
        proc.on('close', () => {
          this.pubsub.saveThenPublish(prId, { dbName: null, dbState: 'offline', dbErrorMessage: null })
        })
      })

      const stopInstancePromise = this.aws.stopInstance(instanceId)

      Promise.all([deleteDBPromise, stopInstancePromise]).then(() => {
        this.pubsub.saveThenPublish(prId, { instanceState: 'offline' })
        this.aws.deleteInstance(instanceId).then(() => {
          this.db.delete(prId)
        })
      })
    })
  }

  pollInstanceState({ prId, resolve, reject, uiType, instanceId, ignoreFirstState = "", pollCount = 0, status = "" }) {
    console.log("qai: pollInstanceState for", uiType);
    pollCount += 1

    this.aws.describeInstances(instanceId).then(data => {
      const newStatus = data.Instances[0].Status
      console.log('qai: pollInstanceState', newStatus);
      const timedOut = pollCount === MAX_POLL_COUNT

      // Is this a state we're temporarily ignoring, like "offline" when we _just_ triggered a deploy? If so, recurse.
      if (ignoreFirstState === status && !timedOut) {
        setTimeout(this.pollInstanceState.bind(this, { prId, resolve, reject, uiType, instanceId, ignoreFirstState, pollCount, status }), POLL_STATE_INTERVAL)

      } else {
        // Are we online?
        if (DEPLOY_ONLINE_STATES) {
          this.pubsub.saveThenPublish(prId, { [uiType + "State"]: States.Online })
          resolve()

        // Are we offline?
        } else if (DEPLOY_OFFLINE_STATES) {
          this.pubsub.saveThenPublish(prId, { [uiType + "State"]: States.Offline })
          resolve()

        // Are we in an error state?
        } else if (DEPLOY_ERROR_STATES) {
          this.pubsub.saveThenPublish(prId, { [uiType + "State"]: States.Error, [uiType + "Error"]: status })
          reject()

        // Have we timed out?
        } else if (timedOut) {
          this.pubsub.saveThenPublish(prId, { [uiType + "State"]: States.Error, [uiType + "Error"]: "timed out" })
          reject()

        // If none of the above, recurse.
        } else {

          // Also, if this is a new state, publish a progress update.
          if (newStatus !== status) {
            this.pubsub.publish(prId, { [uiType + "Progress"]: status })
          }

          setTimeout(this.pollInstanceState.bind(this, { prId, resolve, reject, uiType, instanceId, pollCount, newStatus }), POLL_STATE_INTERVAL)
        }
      }
    })

  }

}