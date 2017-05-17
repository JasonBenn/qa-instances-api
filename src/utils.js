import path from 'path'
import fs from 'fs'
import stripJsonComments from 'strip-json-comments'
import 'colors'


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

export const getPipeDataCmd = ({local, dbHost, dbUser, dbPassword}) => {
  return `mysql -h ${dbHost} -u ${dbUser} -p${dbPassword} `
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

export const getDomainName = hostName => hostName + ".minervaproject.com"

const isSubset = (a, b) => a.every(el => b.includes(el))
const REQUIRED_CONFIG_KEYS = ["repoName", "region", "stackId", "layerId", "appId", "route53HostedZoneID", "dbHost", "dbUser", "dbPassword", "dbS3BackupBucketName", "dbS3BackupGrepPrefix"]

export const validateConfig = config => {
  const validConfig = isSubset(REQUIRED_CONFIG_KEYS, Object.keys(config))
  if (!validConfig) console.error("Invalid config!".bold.red + " Must have keys: " + REQUIRED_CONFIG_KEYS.join(', '));
}

export const readJSON = filename => {
  return new Promise(function(resolve, reject) {
    fs.readFile(path.resolve(filename), 'utf8', (err, data) => {
      if (err) reject(err)
      resolve(JSON.parse(stripJsonComments(data)))
    })
  })
}
