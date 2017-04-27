import { rebroadcastCmds } from './utils'


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
      debugger;
      var i = this.sockets.indexOf(socket);
      if (i !== -1) this.sockets.splice(i, 1);
    })
  }

  publish(channel, message) {
    this.sockets.forEach(socket => {
      socket.emit(channel, message)
    })
    console.log('sent < ', channel, ':', message, ' > to', this.sockets.length, 'sockets');
  }

  saveThenPublish(prId, data) {
    console.log('saving and publishing', prId, data);
    return new Promise(function(resolve, reject) {
      const values = _.map(data, (value, key) => [key, value].join(' = ')).join(', ')
      // Why isn't this ever getting logged locally?
      console.log(values)

      console.log('saving')
      this.db.run('UPDATE pulls SET ' + values + ' WHERE prId = ?', prId, (err, row) => {
        console.log('saved', err, row)
        if (err) reject(err)
        publish(this.config.repoName + '/pulls/' + prId, JSON.stringify(data))
        resolve(row)
      })   
    })
  }

}