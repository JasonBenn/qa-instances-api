import SQLite3 from 'sqlite3'
import { promiseCb } from './utils'
import _ from 'underscore'
const LOG_QUERIES = true


export const States = {
  Offline: "offline",
  Starting: "starting",
  Online: "online",
  Stopping: "stopping",
  Error: "error"
}

export default class DB {
  constructor() {
    this.db = new SQLite3.Database("db.sqlite")
  }

  all(columns="*") {
    if (LOG_QUERIES) console.log(`db: SELECT ${columns}`);
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT ${columns} FROM pulls`, undefined, promiseCb(resolve, reject))
    })
  }

  create(data) {
    const { keys, questionMarks, values } = this.getQueryTemplateParams(data)
    return new Promise((resolve, reject) => {
      if (LOG_QUERIES) console.log(`db: INSERT OR IGNORE INTO pulls (${keys}) VALUES (${questionMarks})`, values)
      this.db.run(`INSERT OR IGNORE INTO pulls (${keys}) VALUES (${questionMarks})`, values, promiseCb(resolve, reject))
    })
  }

  get(prId) {
    return new Promise((resolve, reject) => {
      if (LOG_QUERIES) console.log(`db: SELECT * FROM pulls WHERE prId = ?`, prId)
      this.db.get(`SELECT * FROM pulls WHERE prId = ?`, prId, promiseCb(resolve, reject))
    })
  }

  update(prId, data) {
    return new Promise((resolve, reject) => {
      const values = _.map(data, (value, key) => [key, '"' + value + '"'].join(' = ')).join(', ')
      if (LOG_QUERIES) console.log(`db: UPDATE pulls SET ${values} WHERE prId = ?`, prId)
      this.db.run(`UPDATE pulls SET ${values} WHERE prId = ?`, prId, promiseCb(resolve, reject))
    })
  }

  delete(prId) {
    return new Promise((resolve, reject) => {
      if (LOG_QUERIES) console.log(`db: DELETE FROM pulls WHERE prId = ?`, prId)
      this.db.run(`DELETE FROM pulls WHERE prId = ?`, prId, promiseCb(resolve, reject))
    })
  }

  getLowestAvailableId() {
    return new Promise((resolve, reject) => {
      this.all("id").then(rows => {
        const ids = _.pluck(rows, 'id')
        const highestId = _.max(ids.concat(0))  // If no IDs exist, highest is 0.
        const candidateIds = _.range(highestId + 1).map(id => id + 1)
        console.log('getLowestAvailableId highestId:', highestId, 'candidateIds', candidateIds)
        resolve(_.difference(candidateIds, ids)[0])
      })
    })
  }

  getQueryTemplateParams(obj) {
    const keys = Object.keys(obj)
    const values = keys.map(key => obj[key])
    const questionMarks = [...new Array(keys.length)].map(key => "?").join(', ')
    return { keys, values, questionMarks }
  }

}
