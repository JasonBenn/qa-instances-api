import { execFile } from 'child_process'
import aws from 'aws-sdk'
import { defaultAwsCallback, getDomainName } from './utils'

const dbName = "review_features_lo_detail_page"

// const instanceId = "i-0ad248b7dc45d8846"  // seminar-review1?
const instanceId = 'aa72efd0-79f7-4782-be3a-a807985fec34' // which of these is the opsworks ID, which is the ec2 ID?

const STACK_VPCSTAGING = "fd6cc57c-02fb-433c-bf04-00c1dfc7acdc"
const LAYER_SEMINAR_REVIEW = "3b6657ea-ee38-4586-8f9a-a404366e771b"
const APP_SEMINAR_REVIEW = "24f985e0-1e70-4059-b0f0-aa8d43483d60"
const hostName = "qa-features-lo-detail-page"
const domainName = getDomainName(hostName)

const TERMINAL_STATES = ["connection_lost", "online", "setup_failed", "start_failed", "stop_failed", "stopped"]
// all states: booting|connection_lost|online|pending|rebooting|requested|running_setup|setup_failed|shutting_down|start_failed|stop_failed|stopped|stopping|terminated|terminating
const POLL_STATE_INTERVAL = 5000
const MP_HOSTED_ZONE_ID = "Z2ETWILA1953Q3"
const instanceIp = "54.213.81.155"


export default class AWS {
  constructor(pubsub) {
    aws.config.update({ region: 'us-east-1' })
    this.ec2 = new aws.EC2()
    this.opsworks = new aws.OpsWorks()
    this.route53 = new aws.Route53()
    this.pubsub = pubsub
  }

  createDB(dbName) {
    // https://nodejs.org/api/child_process.html#child_process_child_process_execfile_file_args_options_callback
    // const restoreBackup = execFile(process.cwd() + "/scripts/create-qa-instance-db.sh", null, {
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

  waitForInstanceExists(instanceId) {
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#instanceExists-waiter
    // Wait for instance to be ready, get IP address.
    this.ec2.waitFor('instanceExists', {InstanceIds: [instanceId]}, function(err, data) {
      if (err) console.log(err, err.stack);
      else {
        console.log(data)
        const ipAddress = data.Reservations[0].Instances[0].PublicIpAddress
        // eventually, this should update DB and put IP address in.
      }
    })
  }

  createInstance(prId, prHostname) {
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#createInstance-property
    this.opsworks.createInstance({
      StackId: STACK_VPCSTAGING,
      LayerIds: [LAYER_SEMINAR_REVIEW],
      InstanceType: "m3.large",
      Hostname: prHostname // must not contain underscores
    }, (err, data) => {
      if (err) console.log(err, err.stack)
      else {
        const instanceId = data.InstanceId
        console.log(instanceId)
      }
    })
  }

  deleteInstance(instanceId) {
    this.opsworks.deleteInstance({
      InstanceId: instanceId
    }, defaultAwsCallback)
  }

  startInstance(instanceId) {
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#startInstance-property
    this.opsworks.startInstance({
      InstanceId: instanceId
    }, defaultAwsCallback)
  }

  pollInstanceState(instanceId, ignoreFirstState = "", callCount = 0, currentStatus = "") {
    callCount += 1

    this.opsworks.describeInstances({
      InstanceIds: [instanceId]
    }, (err, data) => {
      if (err) console.log(err, err.stack)
      else {
        const status = data.Instances[0].Status

        if (status !== currentStatus) {
          currentStatus = status
          console.log(currentStatus)
          // send WSS with new state
        }

        if (ignoreFirstState === status) {
          // If the state is something we want to ignore, like "online" when we're stopping, then proceed even though it's a terminal state.
          setTimeout(pollInstanceState.bind(null, instanceId, ignoreFirstState, callCount, currentStatus), POLL_STATE_INTERVAL)
        } else {
          if (TERMINAL_STATES.includes(currentStatus) || callCount === 40) {
            console.log("finished!");
          } else {
            setTimeout(pollInstanceState.bind(null, instanceId, null, callCount, currentStatus), POLL_STATE_INTERVAL)
          }
        }

      }
    })
  }

  stopInstance(instanceId) {
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#stopInstance-property
    this.opsworks.stopInstance({
      InstanceId: instanceId
    }, defaultAwsCallback)
  }

  deployInstance(instanceId, domainName, dbName) {
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#createDeployment-property
    // This is part 1 of the deploy step. This recipe runs in parallel to the database being cloned.
    this.opsworks.createDeployment({
      StackId: STACK_VPCSTAGING,
      AppId: APP_SEMINAR_REVIEW,
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
    }, defaultAwsCallback)
  }

  startInstanceServices(instanceId, domainName, dbName) {
    // This is part 2 of the deploy step. These recipes require that a database is ready.
    this.opsworks.createDeployment({
      StackId: STACK_VPCSTAGING,
      AppId: APP_SEMINAR_REVIEW,
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
    }, defaultAwsCallback)
  }

  changeRoute53Record(prId, domainName, instanceIp, action, callback) {
    this.route53.changeResourceRecordSets({
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
      HostedZoneId: MP_HOSTED_ZONE_ID
    }, callback)
  }

  createRoute53Record(prId, domainName, instanceIp) {
    this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: "creating" }).then(() => console.log('im here somehow', arguments));

    this.changeRoute53Record(prId, domainName, instanceIp, "UPSERT", function(err, data) {
      if (err) {
        this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: err.stack });
        console.log(err, err.stack)
      } else {
        this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: "created" });
      }
    })
  }

  deleteRoute53Record(prId, domainName, instanceIp) {
    this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: "deleting" })

    this.changeRoute53Record(prId, domainName, instanceIp, "DELETE", function(err, data) {
      if (err) {
        this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: err.stack });
        console.log(err, err.stack)
      } else {
        this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: "deleted" });
      }
    })
  }

}

// createDB(dbName)
// opsworks.describeStacks({}, defaultAwsCallback)
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
