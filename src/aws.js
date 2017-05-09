import { execFile } from 'child_process'
import path from 'path'
import aws from 'aws-sdk'
import Promise from 'bluebird'
import { getDomainName, getPipeDataCmd } from './utils'


export default class AWS {
  constructor(config) {
    aws.config.loadFromPath(path.resolve('./config/aws.json'))

    if (config.local) this.mockAws()

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
    console.log("aws: createDB", dbName);
    return new Promise((resolve, reject) => {
      const proc = execFile(process.cwd() + "/scripts/create-qa-db.sh", null, {
        env: { 
          dbName: dbName,
          dbHost: this.config.dbHost,
          dbUser: this.config.dbUser,
          dbPassword: this.config.dbPassword,
          dbS3BackupBucketName: this.config.dbS3BackupBucketName,
          dbS3BackupGrepPrefix: this.config.dbS3BackupGrepPrefix,
          pipeDataCmd: getPipeDataCmd(this.config)
        }
      })

      resolve(proc)
    })
  }

  deleteDB(dbName) {
    console.log("aws: deleteDB");
    return new Promise((resolve, reject) => {
      const proc = execFile(process.cwd() + "/scripts/destroy-qa-db.sh", null, {
        env: {
          dbName: dbName,
          pipeDataCmd: getPipeDataCmd(this.config) 
        }
      })

      resolve(proc)
    })
  }

  createInstance(prId, hostName) {
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#createInstance-property
    console.log("aws: createInstance");
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
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#startInstance-property
    console.log("aws: startInstance");
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
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/OpsWorks.html#stopInstance-property
    console.log("aws: stopInstance");
    return this.opsworks.stopInstance({
      InstanceId: instanceId
    }).promise()
  }

  deployInstance({ instanceId, domainName, dbName }) {
    // This is part 1 of the deploy step. This recipe runs in parallel to the database being cloned.
    console.log("aws: deployInstance");
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

  serviceInstance({ instanceId, domainName, dbName }) {
    // This is part 2 of the deploy step. These recipes require that a database is ready.
    console.log("aws: startInstanceServices");
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

  changeRoute53Record({ domainName, instanceIp, action }) {
    console.log("aws: changeRoute53Record");
    const args = {
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
    }
    return this.route53.changeResourceRecordSets(args).promise()
  }

  createRoute53Record(prId, domainName, instanceIp) {
    console.log("aws: createRoute53Record");
    return this.changeRoute53Record({ domainName, instanceIp, action: "UPSERT" })
  }

  deleteRoute53Record(prId, domainName, instanceIp) {
    console.log("aws: deleteRoute53Record");
    return this.changeRoute53Record({ domainName, action: "DELETE" })
  }

}
