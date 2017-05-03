import { rebroadcastCmds } from './utils'
import Promise from 'promise'
import _ from 'underscore'


export default class PubSub {
  constructor(config, db, http) {
    this.sockets = []
    this.db = db
    this.config = config
    this.io = require('socket.io')(http)
    this.io.on('connection', this.onConnection.bind(this))
  }

  onConnection(socket) {
    console.log('connected');
    rebroadcastCmds(socket, this.io)
    this.sockets.push(socket)

    socket.on('disconnect', () => {
      console.log('disconnected');
      var i = this.sockets.indexOf(socket);
      if (i !== -1) this.sockets.splice(i, 1);
    })
  }

  publish(prId, message) {
    const channel = this.config.repoName + '/pulls/' + prId
    this.sockets.forEach(socket => {
      socket.emit(channel, message)
    })
    console.log('sent < ', channel, ':', message, ' > to', this.sockets.length, 'sockets');
  }

  saveThenPublish(prId, data) {
    console.log('saving and publishing', prId, data);
    return new Promise((resolve, reject) => {
      this.db.update(prId, data).then(() => {
        this.publish(prId, JSON.stringify(data))
        resolve()
      })
    })
  }

}