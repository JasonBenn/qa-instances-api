import { exec, spawn, execFile } from 'child_process'
import path from 'path'
import aws from 'aws-sdk'
import Promise from 'bluebird'
import { getDomainName, getPipeDataCmd, defaultAwsCb } from './utils'


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
    aws.mock('OpsWorks', 'createInstance', defaultAwsCb({ InstanceId: "1" }))
    aws.mock('OpsWorks', 'deleteInstance', defaultAwsCb({}))
    aws.mock('OpsWorks', 'startInstance', defaultAwsCb({}))
    aws.mock('OpsWorks', 'describeInstances', defaultAwsCb({ Instances: [{ Status: 'online', PublicIp: '1.1.1.1' }] }))
    aws.mock('OpsWorks', 'describeDeployments', defaultAwsCb({ Deployments: [{ Status: 'successful' }] }))
    aws.mock('OpsWorks', 'stopInstance', defaultAwsCb({}))
    aws.mock('OpsWorks', 'createDeployment', defaultAwsCb({ DeploymentId: '000x0xxx000' }))
    aws.mock('Route53', 'changeResourceRecordSets', defaultAwsCb({}))
  }

  mockAwsDeletion() {
    const aws = require('aws-sdk-mock')
    aws.mock('OpsWorks', 'describeInstances', defaultAwsCb({ Instances: [{ Status: 'offline' }] }))
  }

  createDB(dbName) {
    console.log("aws: createDB", dbName);
    return new Promise((resolve, reject) => {
      const script = this.config.local ? "create-qa-db-local.sh" : "create-qa-db.sh"
      const proc = execFile(process.cwd() + "/scripts/" + script, null, {
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

  getOpsworksProcess(hostName) {
    console.log("aws: getOpenOpsworksLogFilename", hostName)
    const command = `ssh ${hostName}.vpcstaging 'ps aux | grep tee | grep opsworks'`
    const execPromise = Promise.promisify(exec)
    return execPromise(command)  // works because first two args to exec callback are (err, stdout)
  }

  tailOpsworksLog(hostName, filename) {
    const args =  [`${hostName}.vpcstaging`, `sudo tail -f ${filename}`]
    console.log("aws: tailOpsworksLog", args)
    return spawn("ssh", args)
  }

  deleteDB(dbName) {
    console.log("aws: deleteDB", dbName);
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

  createInstance(hostName) {
    console.log("aws: createInstance", hostName);
    return this.opsworks.createInstance({
      StackId: this.config.stackId,
      LayerIds: [this.config.layerId],
      InstanceType: "m3.large",
      Hostname: hostName
    }).promise()
  }

  deleteInstance(instanceId) {
    console.log("aws: deleteInstance", instanceId);
    return this.opsworks.deleteInstance({
      InstanceId: instanceId
    }).promise()
  }

  startInstance(instanceId) {
    console.log("aws: startInstance", instanceId);
    return this.opsworks.startInstance({
      InstanceId: instanceId
    }).promise()
  }

  describeInstance(instanceId) {
    return this.opsworks.describeInstances({
      InstanceIds: [instanceId]
    }).promise()
  }

  describeDeployment(deploymentId) {
    return this.opsworks.describeDeployments({
      DeploymentIds: [deploymentId]
    }).promise()
  }

  stopInstance(instanceId) {
    console.log("aws: stopInstance", instanceId);
    return this.opsworks.stopInstance({
      InstanceId: instanceId
    }).promise()
  }

  deployInstance({ instanceId, domainName, dbName, prName }) {
    // This is part 1 of the deploy step. This recipe runs in parallel to the database being cloned.
    console.log("aws: deployInstance", { instanceId, domainName, dbName, prName });
    return this.opsworks.createDeployment({
      StackId: this.config.stackId,
      AppId: this.config.appId,
      InstanceIds: [instanceId],
      Command: {
        Name: "execute_recipes",
        Args: {
          recipes: [
            "seminar::deploy_qa_instances",
          ]
        }
      },
      CustomJson: JSON.stringify({
        deploy: {
          "seminar-qa-instances": {
            "branch": prName,
            domain: domainName,
            seminar_url: "https://" + domainName,
            database: { db: dbName }
          }

        }
      })
    }).promise()
  }

  serviceInstance({ instanceId, domainName, dbName, prName }) {
    // This is part 2 of the deploy step. These recipes require that a database is ready.
    console.log("aws: startInstanceServices", { instanceId, domainName, dbName, prName });
    return this.opsworks.createDeployment({
      StackId: this.config.stackId,
      AppId: this.config.appId,
      InstanceIds: [instanceId],
      Command: {
        Name: "execute_recipes",
        Args: {
          recipes: [
            "seminar::sanitize",
            "seminar::service_qa_instances",
            "seminar::singletons_qa_instances"
          ]
        }
      },
      CustomJson: JSON.stringify({
        deploy: {
          "seminar-qa-instances": {
            "branch": prName,
            domain: domainName,
            seminar_url: "https://" + domainName,
            database: { db: dbName }
          }
        }
      })
    }).promise()
  }

  changeRoute53Record({ domainName, publicIp, action }) {
    console.log("aws: changeRoute53Record", { domainName, publicIp, action });
    return this.route53.changeResourceRecordSets({
      ChangeBatch: {
        Changes: [{
          Action: action,
          ResourceRecordSet: {
            Name: domainName + ".",
            ResourceRecords: [{ Value: publicIp }],
            TTL: 60,
            Type: "A"
          }
        }],
        Comment: "QA instance"
      },
      HostedZoneId: this.config.route53HostedZoneID
    }).promise()
  }

  createRoute53Record(domainName, publicIp) {
    console.log("aws: createRoute53Record", domainName, publicIp);
    return this.changeRoute53Record({ domainName, publicIp, action: "UPSERT" })
  }

  deleteRoute53Record(domainName, publicIp) {
    console.log("aws: deleteRoute53Record", domainName, publicIp);
    return this.changeRoute53Record({ domainName, publicIp, action: "DELETE" })
  }

}
