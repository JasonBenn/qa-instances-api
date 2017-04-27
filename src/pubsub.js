import { rebroadcastCmds } from './utils'
import Promise from 'promise'


export default class PubSub {
  constructor(http, db, config) {
    this.sockets = []
    this.db = db
    this.config = config
    this.io = require('socket.io')(http)
    this.io.on('connection', this.onConnection)
  }

  onConnection(socket) {
    console.log('connected!')
    rebroadcastCmds(socket, this.io)
    console.log('sockets', this.sockets)
    this.sockets.push(socket)

    socket.on('disconnect', function() {
      console.log('disconnected!');
      // debugger;
      var i = this.sockets.indexOf(socket);
      if (i !== -1) this.sockets.splice(i, 1);
    })
  }

  publish(prId, message) {
    this.sockets.forEach(socket => {
      socket.emit(this.config.repoName + '/pulls/' + prId, message)
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