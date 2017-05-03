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
    console.log('ps: connected');
    rebroadcastCmds(socket, this.io)
    this.sockets.push(socket)

    socket.on('disconnect', () => {
      console.log('ps: disconnected');
      var i = this.sockets.indexOf(socket);
      if (i !== -1) this.sockets.splice(i, 1);
    })
  }

  publish(prId, data) {
    const channel = this.config.repoName + '/pull/' + prId
    const message = JSON.stringify(data)

    this.sockets.forEach(socket => {
      socket.emit(channel, message)
    })
    console.log('ps: sent "' + message + '" on channel "' + channel + '" to', this.sockets.length, 'socket(s)');
  }

  saveThenPublish(prId, data) {
    console.log('ps: saving and publishing', prId, data);
    return new Promise((resolve, reject) => {
      this.db.update(prId, data).then(() => {
        this.publish(prId, data)
        resolve()
      })
    })
  }

}