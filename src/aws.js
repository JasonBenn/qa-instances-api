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

    return new Promise((resolve, reject) => {
      // const scriptPath = process.cwd() + "/scripts/create-qa-db.sh"
      const scriptPath = process.cwd() + "/scripts/ten-secs-of-stderr.sh"
      const { dbHost, dbUse, dbS3BackupBucketName, dbS3BackupGrepPrefix } = this.config
      const proc = execFile(scriptPath, null, {
        env: { dbName, dbHost, dbUser, dbPassword, dbS3BackupBucketName, dbS3BackupGrepPrefix }
      })

      resolve(proc)
    })
  }

  deleteDB(dbName) {
    console.log("aws: deleteDB");

    return new Promise((resolve, reject) => {
      // const scriptPath = process.cwd() + "/scripts/destroy-qa-db.sh"
      const scriptPath = process.cwd() + "/scripts/ten-secs-of-stderr.sh"
      const { dbHost, dbUser, dbPassword } = this.config
      const proc = execFile(scriptPath, null, {
        env: { dbName, dbHost, dbUser, dbPassword }
      })

      resolve(proc)
    })
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
    console.log("aws: deleteInstance");
    return this.opsworks.deleteInstance({
      InstanceId: instanceId
    }).promise()
  }

  startInstance(instanceId) {
    console.log("aws: startInstance");
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#startInstance-property
    return this.opsworks.startInstance({
      InstanceId: instanceId
    }).promise()
  }

  describeInstances(instanceId) {
    console.log("aws: describeInstances");
    return this.opsworks.describeInstances({
      InstanceIds: [instanceId]
    }).promise()
  }

  stopInstance(instanceId) {
    console.log("aws: stopInstance");
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#stopInstance-property
    return this.opsworks.stopInstance({
      InstanceId: instanceId
    }).promise()
  }

  deployInstance(instanceId, domainName, dbName) {
    console.log("aws: deployInstance");
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
    console.log("aws: startInstanceServices");
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
    console.log("aws: changeRoute53Record");
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
    console.log("aws: createRoute53Record");
    // this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: "creating" })
    return this.changeRoute53Record(domainName, instanceIp, "UPSERT")
    // , function(err, data) {
      console.log("aws:     //");
    //   if (err) {
      console.log("aws:     //");
    //     this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: err.stack });
    //     console.log(err, err.stack)
    //   } else {
    //     this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: "created" });
    //   }
    // })
  }

  deleteRoute53Record(prId, domainName, instanceIp) {
    console.log("aws: deleteRoute53Record");
    // this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: "deleting" })
    return this.changeRoute53Record(domainName, instanceIp, "DELETE")
    // , function(err, data) {
      console.log("aws:     //");
    //   if (err) {
      console.log("aws:     //");
    //     this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: err.stack });
    //     console.log(err, err.stack)
    //   } else {
    //     this.pubsub.saveThenPublish('picasso/pull/' + prId, { route53State: "deleted" });
    //   }
    // })
  }

}
