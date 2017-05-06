import express from 'express'
import bodyParser from 'body-parser'
import { logErrors, readJSON, validateConfig } from './utils'
import logger from 'morgan-body';
import Promise from 'promise'
import { routes } from './routes'
import PubSub from './pubsub'
import AWS from './aws'
import DB from './db'
import QaInstances from './qa-instances'
import 'colors'

const port = process.env.PORT || 3000

const app = express()
const http = require('http').Server(app)

readJSON('./config/picasso.json').then(config => {
  validateConfig(config)

  app.use(bodyParser.json())
  app.use(logErrors)
  logger(app)

  const db = new DB()
  const aws = new AWS(config)
  const pubsub = new PubSub(config, db, http)
  const qaInstances = new QaInstances(db, aws, pubsub)

  routes(app, db, aws, pubsub, qaInstances)

  Promise.resolve()
    .then(() => http.listen(port))
    .then(() => console.log('listening on *:' + port))
    .catch(err => console.error(err.stack))  
}).catch(err => console.log(err.bold.red))
