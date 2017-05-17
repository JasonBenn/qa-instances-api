import { readJSON } from '../src/utils'
import path from 'path'
import AWS from '../src/aws'
import DB from '../src/db'
import _ from 'underscore'


readJSON('./config/picasso.json').then(config => {
  const aws = new AWS(config)
  const db = new DB()

  // db.all("id").then(data => console.log(data))
  // db.getLowestAvailableId().then(data => console.log(data))

  // const domainName = "qa-jb-bogus-test-pr.minervaproject.com"
  // const publicIp = "54.245.189.101"
  // const instanceId = "51231c20-ffb5-4f82-965e-67ddfafb76e7"
  // const dbName = "jb_bogus_test_pr"

  // aws.describeInstance("b6352f7d-8891-45b1-94cf-8147fd782f43").then(data => console.log(data) })
  // aws.createInstance("test").then(data => console.log(data))
  // aws.startInstance("b6352f7d-8891-45b1-94cf-8147fd782f43").then(data => console.log(data))
  // aws.deleteInstance("20ace0a2-bb0b-4f1e-bac2-82a9e6c0438f").then(data => console.log(data))
  // aws.stopInstance("b6352f7d-8891-45b1-94cf-8147fd782f43").then(data => console.log(data))
  // aws.createRoute53Record(domainName, publicIp).then(data => console.log(data))
  // aws.deleteRoute53Record(domainName, publicIp).then(data => console.log(data))

  // aws.deployInstance({ instanceId, domainName, dbName }).then(({DeploymentId}) => {
  // aws.serviceInstance({ instanceId, domainName, dbName }).then(({DeploymentId}) => {
  //   aws.describeDeployment(DeploymentId).then(data => {
  //     console.log(data)
  //     console.log(data.Deployments[0].Status)
  //   })
  // })

  // aws.tailOpsworksLog(hostName).then(proc => {
  //   proc.stdout.on('data', progressUpdate => console.log({ serviceInstanceProgress: progressUpdate.trim() }))
  //   proc.on('close', () => {
  //     if (code === 0) {
  //       this.pubsub.saveThenPublish(prId, { dbState: States.Online })
  //       resolve()
  //     } else {
  //       this.pubsub.saveThenPublish(prId, { overallState: States.Error, dbState: States.Error, dbError: `exit code ${code}` })
  //       reject()
  //     }
  //   })
  //   // proc.stdout.on('data', progressUpdate => this.pubsub.publish(prId, { dbProgress: progressUpdate.trim() }))
  // })

  // aws.getOpenOpsworksLogFilename(hostName).then(openOpsworksLogFilename => {})
  // aws.getOpenOpsworksLogFilename(hostName).then(output => {
  //   console.log(output)
  // })

})
