export const rebroadcastCmds = (socket, io) => {
  socket.on('cmd', function(cmd) {
    var matched = /(.*):(.*)/.exec(cmd);
    if (matched.length >= 3) {
      var channel = matched[1];
      var message = matched[2];
      console.log("received cmd:", cmd, ", channel:", channel, ", message:", message);
      io.emit(channel, message);
    } else {
      console.log('malformed cmd:', cmd)
    }
  })
}