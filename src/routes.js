import path from 'path'
import { createDB, createInstance, deleteInstance, startInstance, stopInstance, deployInstance, createRoute53Record, deleteRoute53Record } from './aws'
import { getHostName, getDomainName, underscoreCase } from './utils'


export const routes = (app, db, aws) => {  
  const defaultErrorHandler = (err, res, next) => {
    res.status(500).send(JSON.stringify({ error: err }))
    next(err)
  }

  const sendRowState = (prId, res, next) => {
    db.get(prId).then(row => {
      res.setHeader('Content-Type', 'application/json')
      res.send(JSON.stringify({ data: row }))
    }).catch(err => {
      defaultErrorHandler(err, res, next)
    })
  }

  app.get('/', function(req, res){
    res.sendFile(path.resolve('./index.html'));
  })

  app.get('/pulls', (req, res, next) => {
    db.all().then(rows => {
      res.setHeader('Content-Type', 'application/json')
      res.send(JSON.stringify({ data: rows }))
    }).catch(err => {
      res.status(500).send({ error: err })
    })
  })

  app.post('/pulls', (req, res, next) => {
    var prId = req.body.prId
    var sha = req.body.sha
    var prName = req.body.prName

    if (!prId || !prName || !sha) {
      res.status(400).send({ error: 'POST request must include prId, prName, and sha' })
    } else {
      const hostName = getHostName(prName)
      db.create({
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
      }).then(() => {
        res.status(201)
        sendRowState(prId, res, next)
      }).catch(err => defaultErrorHandler(err, res, next))
      
    }
  })

  app.get('/pulls/:prId', (req, res, next) => {
    sendRowState(req.params.prId, res, next)
  })

  app.delete('/pulls/:prId', (req, res, next) => {
    if (!req.params.prId) {
      res.status(400).send({ error: 'DELETE request must include prId param' })
    } else {
      db.delete(prId).then(() => {
        res.sendStatus(204)
      }).catch(err => {
        defaultErrorHandler(err, res, next)
      })
    }
  })

}