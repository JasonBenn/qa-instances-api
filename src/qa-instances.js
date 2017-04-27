export default class QaInstances {
  constructor(db, pubsub, aws) {
    this.db = db
    this.pubsub = pubsub
    this.aws = aws
  }

  create(prId, sha, prName) {
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
      aws.createDB().then(() => db.update(prId, { dbName }))
      const instanceIp = "asdf"
      aws.createRoute53Record(prId, getDomainName(hostName), instanceIp)
    })
  }

  delete(prId) {
    this.db.delete(prId)
  }

}