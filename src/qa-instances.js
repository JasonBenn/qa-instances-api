import { getHostName, underscoreCase } from './utils'
import Promise from 'promise'
import treeKill from 'tree-kill'
import _ from 'underscore'


const TERMINAL_STATES = ["connection_lost", "online", "setup_failed", "start_failed", "stop_failed", "stopped"]
// all states: booting|connection_lost|online|pending|rebooting|requested|running_setup|setup_failed|shutting_down|start_failed|stop_failed|stopped|stopping|terminated|terminating
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
        this.aws.createDB().then(proc => {
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
        this.db.update(prId, { instanceId: data.InstanceId })
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

    this.db.get(prId).then(({ instanceId }) => {
      const deleteDBPromise = this.aws.deleteDB().then(proc => {
        this.pubsub.saveThenPublish(prId, { dbState: 'stopping' })
        proc.on('close', () => {
          this.pubsub.saveThenPublish(prId, { dbName: null, dbState: null, dbErrorMessage: null })
        })
      })

      const stopInstancePromise = this.aws.stopInstance(instanceId)

      Promise.all([deleteDBPromise, stopInstancePromise]).then(() => {
        this.aws.deleteInstance(instanceId).then(() => {
          this.db.delete(prId)
        })
      })
    })
  }

  pollInstanceState(prId, instanceId, ignoreFirstState = "", callCount = 0, currentStatus = "") {
    console.log("qai: pollInstanceState");
    callCount += 1

    this.aws.describeInstances(instanceId).then(data => {
      const status = data.Instances[0].Status

      if (status !== currentStatus) {
        currentStatus = status
        this.pubsub.publish(prId, { instanceState: status })
      }

      if (ignoreFirstState === status) {
        // If the state is something we want to ignore, like "online" when we're stopping, then proceed even though it's a terminal state.
        setTimeout(this.pollInstanceState.bind(this, instanceId, ignoreFirstState, callCount, currentStatus), POLL_STATE_INTERVAL)
      } else {
        const notDone = !TERMINAL_STATES.includes(currentStatus)
        if (callCount === 40 && notDone)
          this.pubsub.publish(prId, { instanceState: "timeout" })
        if (notDone) {
          setTimeout(this.pollInstanceState.bind(this, instanceId, null, callCount, currentStatus), POLL_STATE_INTERVAL)
        }
      }
    })

  }

}