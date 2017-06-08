import path from 'path'
import { createDB, createInstance, deleteInstance, startInstance, stopInstance, deployInstance, createRoute53Record, deleteRoute53Record } from './aws'
import { getHostName, getDomainName, underscoreCase } from './utils'
import 'colors'


export const routes = (app, db, aws, pubsub, qaInstances) => {  
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
    console.log("app: get /");
    res.sendFile(path.resolve('./index.html'));
  })

  app.get('/pulls', (req, res, next) => {
    console.log("app: get /pulls");
    db.all().then(rows => {
      res.setHeader('Content-Type', 'application/json')
      res.send(JSON.stringify({ data: rows }))
    }).catch(err => {
      res.status(500).send({ error: err })
    })
  })

  app.post('/pulls/updateDB', (req, res, next) => {
    console.log("app: post /pulls/updateDB");
    const { prId } = req.body
    qaInstances.updateDB(prId).then(() => {
      res.setHeader('Content-Type', 'application/json')
      res.sendStatus(204)
    }).catch(err => defaultErrorHandler(err, res, next))
  })

  app.post('/pulls/redeploy', (req, res, next) => {
    console.log("app: post /pulls/redeploy");
    const { prId, sha } = req.body
    qaInstances.redeploy(prId, sha).then(() => {
      res.setHeader('Content-Type', 'application/json')
      res.sendStatus(204)
    }).catch(err => defaultErrorHandler(err, res, next))
  })

  app.post('/pulls/logs', (req, res, next) => {
    console.log("app: post /pulls/logs");
    const { prId } = req.body
    qaInstances.getLogs(prId).then(logs => {
      res.status(200)
      res.setHeader('Content-Type', 'application/json')
      res.send(JSON.stringify({ data: logs }))
    }).catch(err => defaultErrorHandler(err, res, next))
  })

  app.post('/pulls', (req, res, next) => {
    console.log("app: post /pulls");
    const { prId, sha, prName } = req.body
    const requiredArgs = [prId, sha, prName]

    if (!requiredArgs.every(x => x)) {
      res.status(400).send({ error: 'POST request must include ' + requiredArgs.join(', ') })
    } else {
      qaInstances.create(prId, sha, prName).then(() => {
        res.status(201)
        sendRowState(prId, res, next)
      }).catch(err => defaultErrorHandler(err, res, next))
    }
  })

  app.get('/pulls/:prId', (req, res, next) => {
    console.log("app: get /pulls/" + req.params.prId);
    sendRowState(req.params.prId, res, next)
  })

  const deletePr = (prId, res) => {
    if (!prId) {
      res.status(400).send({ error: 'DELETE request must include prId' })
    } else {
      qaInstances.delete(prId)
      pubsub.saveThenPublish(prId, { instanceState: 'stopping' }).then(() => {
        res.sendStatus(204)
      })
    }
  }

  app.delete('/pulls/:prId', (req, res, next) => {
    const { prId } = req.params
    console.log("app: delete /pulls/" + prId)
    deletePr(prId, res)
  })

  app.post('/pulls/delete', (req, res, next) => {
    if (req.body.action === "closed") {
      console.log("app: /pulls/delete from webook" + req.body.number)
      deletePr(req.body.number, res)
    } else {
      res.sendStatus(204)
    }
  })

}
