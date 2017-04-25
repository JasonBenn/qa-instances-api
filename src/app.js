// ? HOW much info about an instance's state can I get from the API?
// Does Python have promises? If not, maybe Node/Express(? or the sinatra/flask equivalent for node) would be better for this.

import express from 'express'
import sqlite3 from 'sqlite3'
import bodyParser from 'body-parser'
import { rebroadcastCmds } from './utils'
import path from 'path'
import { createDB, createInstance, deleteInstance, startInstance, stopInstance, deployInstance, createRoute53Record, deleteRoute53Record } from './aws'
import logger from 'morgan-body';
import Promise from 'promise'


const port = process.env.PORT || 3000

const app = express()
var http = require('http').Server(app)
var io = require('socket.io')(http)

io.on('connection', function(socket){
  console.log('connected!');
  rebroadcastCmds(socket, io)
})

const logErrors = (err, req, res, next) => {
  console.error(err.stack)
  next(err)
}

app.use(bodyParser.json())
app.use(logErrors)
logger(app)

app.get('/', function(req, res){
  res.sendFile(path.resolve('./index.html'));
})

app.get('/pulls', (req, res, next) => {
  try {
    io.emit('pulls', "fetching all pulls...");
    db.all(`SELECT * FROM pulls`, undefined, (err, rows) => {
      if (err) return res.status(500).send({ error: err })
      res.setHeader('Content-Type', 'application/json')
      res.send(JSON.stringify({ data: rows }))
    })
  } catch (err) {
    next(err)
  }
})

// GET pulls/:pull_id
//   should connect a websocket
//   returns: current state of all activities, as derived by current progress
//   returns: { state: inactive|booting|setting-up|deploying|finished, data: { url: ... } }
// (client: on success, call GET, open a websocket)
// Creating seminar-jb-lo-index...
    // EC2: created|setting up...|deploying...| :green-check-mark: created
    // Route53 record: waiting on EC2... | :green-check-mark: created
    // RDS DB: :green-check-mark: created
    // RDS user: :green-check-mark: created
    // ^ after this: Done! For 1 second, then replace with `Review app: [seminar-jb-lo-index](url)`

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

app.get('/pulls/:prId', (req, res, next) => {
  sendRowState(req.params.prId, res, next)
})

const createQaInstance = (prId, instanceDomainName, instanceIp) => {
  createRoute53Record(prId, instanceDomainName, instanceIp)
}

const instanceDomainName = hostName => hostName + ".minervaproject.com"
const instanceIp = "54.213.81.155"
const normalize = joinChar => str => str.toLowerCase().replace(/[\/_-]/g, joinChar)
const hypenCase = normalize('-')
const underscoreCase = normalize('_')

// POST pulls (with :pull_id)
//   GET or CREATE w sqlite db.
//   spawn background worker that periodically posts websocket messages
//   returns: success|fail
app.post('/pulls', (req, res, next) => {
  try {
    var prId = req.body.prId
    var sha = req.body.sha
    var prName = req.body.prName

    if (!prId || !prName || !sha) {
      res.status(400).send({ error: 'POST request must include prId, prName, and sha' })
    } else {
      var dbQuery = 'INSERT OR IGNORE INTO pulls (prId, prName, hostName, dbName, instanceState, deployState, sha) VALUES (?, ?, ?, ?, ?, ?, ?)'
      var queryArgs = [prId, prName, hypenCase(prName), underscoreCase(prName), "starting", "stopped", sha]

      db.run(dbQuery, queryArgs, (err, row) => {
        if (err) defaultErrorHandler(err, res, next)
        getRow(prId).then(row => {
          createQaInstance(row.prId, instanceDomainName(row.hostName), row.instanceIp || instanceIp) // TEMPORARY IP
          res.status(201)
          sendRowState(prId, res, next)
        }).catch(err => {
          defaultErrorHandler(err, res, next)
        })
      })
    }
  } catch (err) {
    defaultErrorHandler(err, res, next)
  }
})

app.delete('/pulls/:prId', (req, res, next) => {
  try {
    if (!req.params.prId) {
      res.status(400).send({ error: 'DELETE request must include prId param' })
    } else {
      db.run(`DELETE FROM pulls WHERE (prId = ?)`, req.params.prId, (err, row) => {
        if (err) defaultErrorHandler(err, res, next)
        res.sendStatus(204)
      })
    }
  } catch (err) {
    defaultErrorHandler(err, res, next)
  }
})

const db = new sqlite3.Database("db.sqlite")
Promise.resolve()
  .then(() => http.listen(port))
  .then(() => console.log('listening on *:' + port))
  .catch(err => console.error(err.stack))

// POST deploys (with :pull_id)
//   CREATE w sqlite db
//   spawn background worker that periodically posts websocket messages
//   UPDATE deploying
//   returns: success|fail

// DESTROY pulls (with :pull_id)
//   DESTROY if exists
//   spawn bg worker that periodically posts websocket messages
//   returns: success|fail

// (client: when destroying, allow user to create another app)
// Tearing down seminar-jb-lo-index... 
    // Route53 record: :green-check-mark: deleted
    // RDS DB: :green-check-mark: deleted
    // RDS user: :green-check-mark: deleted
    // EC2: stopping... | :green-check-mark: deleted
    // Deploying...
    // ^ after this: Done! For 1 second, then remove row.

// def push(pr_id, message):
    // pass

// BACKGROUND WORKER
// does all the AWS stuff, and after each call, posts websocket message.
// def create_review_app(pr_id, pr_name):
    // this will prob just receive the ID... chrome extension could extract from URL.
        // if so, will need github API for getting PR name.
    // hostname = normalize_to_hostname(pr_name)
    // db_name = normalize_to_db_name(pr_name)
    // db_username = normalize_to_db_username(pr_name)
    // INSERT pr_id, pr_name, hostname, db_name, db_username, initial state
    // PARALLEL:
        // create_instance(hostname)
            // UPDATE pr_id SET instance_id (wait, do I need this?)
                // POLL for updates every 3-10 seconds?
                    // ON new state: push(pr_id, message)
                    // ON end state: stop polling
                        // create route53 (can i do this before? when do i get the internal DNS for the EC2 instance that I need to point the record at?)
                        // INSERT route53 URL
                        // push(pr_id, message which includes URL)
        // create_db(db_name)
            // THEN create_db_user(db_name)
                // THEN GRANT privileges to user over db.
    // THEN, IN PARALLEL:
        // create deployment. custom JSON will include db_name, db_user as env variables.
        // clone-mke
            // THEN sanitize

// def destroy_review_app(pr_id):
    // be able to destroy partial app - don't break on failure.
    // delete_instance
        // on success: UPDATE pr_id
    // delete_route53
        // on_success: UPDATE pr_id
    // delete db_name
        // on_success: UPDATE pr_id
    // delete db_username
        // on_success: UPDATE pr_id
    // WHEN all done:
        // delete record.

// def deploy(pr_id):
    // create deployment API - always use latest SHA
    // pass

// Also: update local state and render with websocket messages.
// Set it up so that you pass a blob of data and render the whole thing 
