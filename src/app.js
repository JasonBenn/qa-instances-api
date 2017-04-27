import express from 'express'
import bodyParser from 'body-parser'
import { logErrors, readConfig } from './utils'
import logger from 'morgan-body';
import Promise from 'promise'
import { routes } from './routes'
import PubSub from './pubsub'
import AWS from './aws'
import DB from './db'
import QaInstances from './qa-instances'


const port = process.env.PORT || 3000

const app = express()
const http = require('http').Server(app)

readConfig('picasso').then(config => {
  app.use(bodyParser.json())
  app.use(logErrors)
  logger(app)

  const db = new DB()
  const pubsub = new PubSub(http, db, config)
  const aws = new AWS(config)
  const qaInstances = new QaInstances(db, pubsub, aws)
  routes(app, db, aws, pubsub, qaInstances)

  Promise.resolve()
    .then(() => http.listen(port))
    .then(() => console.log('listening on *:' + port))
    .catch(err => console.error(err.stack))  
})
