import { getHostName, underscoreCase } from './utils'
import Promise from 'promise'


const TERMINAL_STATES = ["connection_lost", "online", "setup_failed", "start_failed", "stop_failed", "stopped"]
// all states: booting|connection_lost|online|pending|rebooting|requested|running_setup|setup_failed|shutting_down|start_failed|stop_failed|stopped|stopping|terminated|terminating
const POLL_STATE_INTERVAL = 5000


export default class QaInstances {
  constructor(db, aws, pubsub) {
    this.db = db
    this.pubsub = pubsub
    this.aws = aws
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
          proc.stderr.on('data', data => this.pubsub.publish(prId, data.trim()))
          proc.on('close', code => {
            console.log('qai: createDB exited with code', code);
            if (code === 0) {
              this.db.update(prId, { dbName })
              resolve()
            }
          })
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

  delete(prId) {
    console.log("qai: delete");
    this.db.get(prId).then(({ instanceId }) => {
      const deleteDBPromise = this.aws.deleteDB()
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