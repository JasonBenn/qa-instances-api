import { execFile } from 'child_process'
import path from 'path'
import aws from 'aws-sdk'
import { getDomainName } from './utils'

// These will all eventually come from DB.
const instanceId = 'aa72efd0-79f7-4782-be3a-a807985fec34'
const dbName = "review_features_lo_detail_page"
const hostName = "qa-features-lo-detail-page"
const instanceIp = "54.213.81.155"
const domainName = getDomainName(hostName)

const TERMINAL_STATES = ["connection_lost", "online", "setup_failed", "start_failed", "stop_failed", "stopped"]
// all states: booting|connection_lost|online|pending|rebooting|requested|running_setup|setup_failed|shutting_down|start_failed|stop_failed|stopped|stopping|terminated|terminating
const POLL_STATE_INTERVAL = 5000
const MOCK_AWS = true


export default class AWS {
  constructor(config) {
    aws.config.loadFromPath(path.resolve('./config/aws.json'))
    this.opsworks = new aws.OpsWorks()
    this.route53 = new aws.Route53()
    this.pubsub = pubsub
    this.config = config

    if (MOCK_AWS) this.mockAws()
  }

  mockAws() {
    const aws = require('aws-sdk-mock')
    const defaultCb = (params, cb) => cb(null, 'success')
    aws.mock('OpsWorks', 'createInstance', defaultCb)
    aws.mock('OpsWorks', 'deleteInstance', defaultCb)
    aws.mock('OpsWorks', 'startInstance', defaultCb)
    aws.mock('OpsWorks', 'describeInstances', defaultCb)
    aws.mock('OpsWorks', 'stopInstance', defaultCb)
    aws.mock('OpsWorks', 'createDeployment', defaultCb)
    aws.mock('Route53', 'changeResourceRecordSets', defaultCb)
  }

  createDB(dbName) {
    // https://nodejs.org/api/child_process.html#child_process_child_process_execfile_file_args_options_callback
    // const restoreBackup = execFile(process.cwd() + "/scripts/create-api-db.sh", null, {
    const restoreBackup = execFile(process.cwd() + "/scripts/ten-secs-of-stderr.sh", null, {
      env: {
        dbName: dbName
      }
    })

    restoreBackup.stderr.on('data', data => console.log(data.toString()))

    restoreBackup.on('close', code => {
      if (code === 0) console.log("Created!")
    })
  }

  createInstance(prId, prHostname) {
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#createInstance-property
    return this.opsworks.createInstance({
      StackId: this.config.stackId,
      LayerIds: [this.config.layerId],
      InstanceType: "m3.large",
      Hostname: prHostname
    }).promise()
    // (err, data) => {
    //   if (err) console.log(err, err.stack)
    //   else {
    //     const instanceId = data.InstanceId
    //     console.log(instanceId)
    //     // this.db.update(prId, { instanceId: instanceId })
    //   }
    // }
  }

  deleteInstance(instanceId) {
    return this.opsworks.deleteInstance({
      InstanceId: instanceId
    }).promise()
  }

  startInstance(instanceId) {
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#startInstance-property
    return this.opsworks.startInstance({
      InstanceId: instanceId
    }).promise()
  }

  pollInstanceState(instanceId, ignoreFirstState = "", callCount = 0, currentStatus = "") {

    // TODO

    // callCount += 1
    // , (err, data) => {
    //   if (err) console.log(err, err.stack)
    //   else {
    //     const status = data.Instances[0].Status

    //     if (status !== currentStatus) {
    //       currentStatus = status
    //       console.log(currentStatus)
    //       // send WSS with new state
    //     }

    //     if (ignoreFirstState === status) {
    //       // If the state is something we want to ignore, like "online" when we're stopping, then proceed even though it's a terminal state.
    //       setTimeout(pollInstanceState.bind(null, instanceId, ignoreFirstState, callCount, currentStatus), POLL_STATE_INTERVAL)
    //     } else {
    //       if (TERMINAL_STATES.includes(currentStatus) || callCount === 40) {
    //         console.log("finished!");
    //       } else {
    //         setTimeout(pollInstanceState.bind(null, instanceId, null, callCount, currentStatus), POLL_STATE_INTERVAL)
    //       }
    //     }

    //   }
    // })

    return this.opsworks.describeInstances({
      InstanceIds: [instanceId]
    }).promise()
  }

  stopInstance(instanceId) {
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#stopInstance-property
    return this.opsworks.stopInstance({
      InstanceId: instanceId
    }).promise()
  }

  deployInstance(instanceId, domainName, dbName) {
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#createDeployment-property
    // This is part 1 of the deploy step. This recipe runs in parallel to the database being cloned.
    return this.opsworks.createDeployment({
      StackId: this.config.stackId,
      AppId: this.config.appId,
      InstanceIds: [instanceId],
      Command: {
        Name: "execute_recipes",
        Args: {
          recipes: [
            "seminar::deploy_seminar_review",
          ]
        }
      },
      CustomJson: JSON.stringify({
        deploy: {
          seminar_review: {
            "branch": "jb/qa-instances",  // Temporary.
            domain: domainName,
            seminar_url: "https://" + domainName,
            database: { db: dbName }
          }

        }
      })
    }).promise()
  }

  startInstanceServices(instanceId, domainName, dbName) {
    // This is part 2 of the deploy step. These recipes require that a database is ready.
    return this.opsworks.createDeployment({
      StackId: this.config.stackId,
      AppId: this.config.appId,
      InstanceIds: [instanceId],
      Command: {
        Name: "execute_recipes",
        Args: {
          recipes: [
            "seminar::sanitize",
            "seminar::service_seminar_review",
            "seminar::singletons_seminar_review"
          ]
        }
      },
      CustomJson: JSON.stringify({
        deploy: {
          seminar_review: {
            "branch": "jb/qa-instances",  // Temporary.
            domain: domainName,
            seminar_url: "https://" + domainName,
            database: { db: dbName }
          }
        }
      })
    }).promise()
  }

  changeRoute53Record(domainName, instanceIp, action) {
    return this.route53.changeResourceRecordSets({
      ChangeBatch: {
        Changes: [{
          Action: action,
          ResourceRecordSet: {
            Name: domainName + ".",
            ResourceRecords: [{ Value: instanceIp }],
            TTL: 60,
            Type: "A"
          }
        }],
        Comment: "QA instance"
      },
      HostedZoneId: this.config.route53HostedZoneID
    }).promise()
  }

  createRoute53Record(prId, domainName, instanceIp) {
    // this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: "creating" })
    return this.changeRoute53Record(domainName, instanceIp, "UPSERT")
    // , function(err, data) {
    //   if (err) {
    //     this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: err.stack });
    //     console.log(err, err.stack)
    //   } else {
    //     this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: "created" });
    //   }
    // })
  }

  deleteRoute53Record(prId, domainName, instanceIp) {
    // this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: "deleting" })
    return this.changeRoute53Record(domainName, instanceIp, "DELETE")
    // , function(err, data) {
    //   if (err) {
    //     this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: err.stack });
    //     console.log(err, err.stack)
    //   } else {
    //     this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: "deleted" });
    //   }
    // })
  }

}

// createDB(dbName)
// opsworks.describeStacks({}).promise()
// createInstance(prId, prHostname)
// deleteInstance(instanceId)
// startInstance(instanceId, "stopped")
// pollInstanceState(instanceId)
// stopInstance(instanceId)
// pollInstanceState(instanceId, "online")
// deployInstance(instanceId, domainName, dbName)
// pollInstanceState(instanceId, "online")
// deployInstance(instanceId, domainName, dbName)
// pollInstanceState(instanceId, "online")
// createRoute53Record(2300, domainName, instanceIp)
