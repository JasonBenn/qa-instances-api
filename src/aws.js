import { execFile } from 'child_process'
import path from 'path'
import aws from 'aws-sdk'
import Promise from 'promise'
import { getDomainName } from './utils'

// These will all eventually come from DB.
const instanceId = 'aa72efd0-79f7-4782-be3a-a807985fec34'
const dbName = "review_features_lo_detail_page"
const hostName = "qa-features-lo-detail-page"
const instanceIp = "54.213.81.155"
const domainName = getDomainName(hostName)

const MOCK_AWS = true


export default class AWS {
  constructor(config) {
    aws.config.loadFromPath(path.resolve('./config/aws.json'))

    if (MOCK_AWS) this.mockAws()

    this.config = config
    this.opsworks = new aws.OpsWorks()
    this.route53 = new aws.Route53()
  }

  mockAws() {
    const aws = require('aws-sdk-mock')
    const defaultCb = (responseData = {}) => (params, cb) => cb(null, responseData)
    aws.mock('OpsWorks', 'createInstance', defaultCb({ InstanceId: 1 }))
    aws.mock('OpsWorks', 'deleteInstance', defaultCb())
    aws.mock('OpsWorks', 'startInstance', defaultCb())
    aws.mock('OpsWorks', 'describeInstances', defaultCb())
    aws.mock('OpsWorks', 'stopInstance', defaultCb())
    aws.mock('OpsWorks', 'createDeployment', defaultCb())
    aws.mock('Route53', 'changeResourceRecordSets', defaultCb())
  }

  createDB(dbName) {
    console.log("aws: createDB");
    // https://nodejs.org/api/child_process.html#child_process_child_process_execfile_file_args_options_callback
    return new Promise((resolve, reject) => {
      // const restoreBackup = execFile(process.cwd() + "/scripts/create-api-db.sh", null, {
      const scriptPath = process.cwd() + "/scripts/ten-secs-of-stderr.sh"
      const proc = execFile(scriptPath, null, {
        env: { dbName: dbName }
      })

      resolve(proc)
    })
  }

  deleteDB(dbName) {
    console.log("aws: deleteDB");
    // TODO
  }

  createInstance(prId, hostName) {
    console.log("aws: createInstance");
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#createInstance-property
    return this.opsworks.createInstance({
      StackId: this.config.stackId,
      LayerIds: [this.config.layerId],
      InstanceType: "m3.large",
      Hostname: hostName
    }).promise()
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

  describeInstances(instanceId) {
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
