import path from 'path'
import { createDB, createInstance, deleteInstance, startInstance, stopInstance, deployInstance, createRoute53Record, deleteRoute53Record } from './aws'
import { getHostName, underscoreCase } from './utils'


export const routes = (app, db, aws) => {  
  const defaultErrorHandler = (err, res, next) => {
    res.status(500).send(JSON.stringify({ error: err }))
    next(err)
  }

  const getRow = prId => {
    return new Promise(function(resolve, reject) {
      db.get(`SELECT * FROM pulls WHERE prId = ?`, prId, (err, row) => {
        if (err) reject(err)
        resolve(row)
      })   
    })
  }

  const sendRowState = (prId, res, next) => {
    getRow(prId).then(row => {
      res.setHeader('Content-Type', 'application/json')
      res.send(JSON.stringify({ data: row }))
    }).catch(err => {
      defaultErrorHandler(err, res, next)
    })
  }

  const createQaInstance = (prId, hostName, instanceIp) => {
    aws.createRoute53Record(prId, getDomainName(hostName), instanceIp)
  }

  app.get('/', function(req, res){
    res.sendFile(path.resolve('./index.html'));
  })

  app.get('/pulls', (req, res, next) => {
    io.emit('pulls', "fetching all pulls...");
    db.all(`SELECT * FROM pulls`, undefined, (err, rows) => {
      if (err) return res.status(500).send({ error: err })
      res.setHeader('Content-Type', 'application/json')
      res.send(JSON.stringify({ data: rows }))
    })
  })

  app.post('/pulls', (req, res, next) => {
    var prId = req.body.prId
    var sha = req.body.sha
    var prName = req.body.prName

    if (!prId || !prName || !sha) {
      res.status(400).send({ error: 'POST request must include prId, prName, and sha' })
    } else {
      var dbQuery = 'INSERT OR IGNORE INTO pulls (prId, prName, hostName, dbName, instanceState, deployState, sha) VALUES (?, ?, ?, ?, ?, ?, ?)'
      var queryArgs = [prId, prName, getHostName(prName), underscoreCase(prName), "starting", "stopped", sha]

      aws.createDB('')

      db.run(dbQuery, queryArgs, (err, row) => {
        if (err) defaultErrorHandler(err, res, next)
        getRow(prId).then(row => {
          createQaInstance(row.prId, row.hostName, row.instanceIp || instanceIp) // TEMPORARY IP
          res.status(201)
          sendRowState(prId, res, next)
        }).catch(err => {
          defaultErrorHandler(err, res, next)
        })
      })
    }
  })

  app.get('/pulls/:prId', (req, res, next) => {
    sendRowState(req.params.prId, res, next)
  })

  app.delete('/pulls/:prId', (req, res, next) => {
    if (!req.params.prId) {
      res.status(400).send({ error: 'DELETE request must include prId param' })
    } else {
      db.run(`DELETE FROM pulls WHERE (prId = ?)`, req.params.prId, (err, row) => {
        if (err) defaultErrorHandler(err, res, next)
        res.sendStatus(204)
      })
    }
  })

}