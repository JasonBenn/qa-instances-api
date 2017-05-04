import path from 'path'
import fs from 'fs'
import stripJsonComments from 'strip-json-comments'


export const rebroadcastCmds = (socket, io) => {
  socket.on('cmd', function(cmd) {
    var matched = /(.*)::(.*)/.exec(cmd);
    if (matched && matched.length >= 3) {
      var channel = matched[1];
      var message = matched[2];
      console.log('cmd: received: "' + cmd + '", channel: "' + channel + '", message: "' + message + '"');
      io.emit(channel, message);
    } else {
      console.log('cmd: malformed:', cmd)
    }
  })
}

export const defaultAwsCb = (err, data) => {
  if (err) console.log(err, err.stack)
  else console.log(data)
}

export const promiseCb = (resolve, reject) => (err, data) => {
  if (err) reject(err)
  resolve(data)
}

export const logErrors = (err, req, res, next) => {
  console.error(err.stack)
  next(err)
}

const normalize = joinChar => str => str.toLowerCase().replace(/[\/_-]/g, joinChar)
export const hypenCase = normalize('-')
export const underscoreCase = normalize('_')

export const getHostName = prName => "qa-" + hypenCase(prName)
export const getDomainName = hostName => hostName + ".minervaproject.com"

const arrayShallowEquals = (a, b) => a.sort().toString() === b.sort().toString()
const REQUIRED_CONFIG_KEYS = ["repoName", "region", "stackId", "layerId", "appId", "route53HostedZoneID", "dbHost", "dbUser", "dbPassword", "dbS3BackupBucketName", "dbS3BackupGrepPrefix"]

export const readConfig = filename => {
  return new Promise(function(resolve, reject) {
    const filepath = path.resolve(`./config/${filename}.json`)
    fs.readFile(filepath, 'utf8', (err, data) => {
      if (err) reject(err)
      const config = JSON.parse(stripJsonComments(data))
      const validConfig = arrayShallowEquals(REQUIRED_CONFIG_KEYS, Object.keys(config))
      return (validConfig) ? resolve(config) : reject("Invalid config! Must have keys " + REQUIRED_CONFIG_KEYS.join(', '))
    })
  })
}
