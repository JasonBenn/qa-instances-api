import express from 'express'
import sqlite3 from 'sqlite3'
import bodyParser from 'body-parser'
import { logErrors, readConfig } from './utils'
import logger from 'morgan-body';
import Promise from 'promise'
import { routes } from './routes'
import PubSub from './pubsub'
import AWS from './aws'


const port = process.env.PORT || 3000

const app = express()
const http = require('http').Server(app)
const db = new sqlite3.Database("db.sqlite")

readConfig('picasso').then(config => {
  app.use(bodyParser.json()) // parse incoming application/json
  app.use(logErrors) // log stack traces
  logger(app) // log request bodies

  const pubsub = new PubSub(http, db, config)
  const aws = new AWS(config, pubsub)
  routes(app, db, aws)

  Promise.resolve()
    .then(() => http.listen(port))
    .then(() => console.log('listening on *:' + port))
    .catch(err => console.error(err.stack))  
})
