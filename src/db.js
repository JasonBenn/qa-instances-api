import SQLite3 from 'sqlite3'
import { promiseCb } from './utils'
import _ from 'underscore'
const LOG_QUERIES = true


export default class DB {
  constructor() {
    this.db = new SQLite3.Database("db.sqlite")
  }

  all() {
    if (LOG_QUERIES) console.log('db: SELECT *');
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM pulls`, undefined, promiseCb(resolve, reject))
    })
  }

  create(data) {
    if (LOG_QUERIES) console.log(`db: INSERT ${JSON.stringify(data)}`)
    const { keys, questionMarks, values } = this.getQueryTemplateParams(data)
    return new Promise((resolve, reject) => {
      this.db.run(`INSERT OR IGNORE INTO pulls (${keys}) VALUES (${questionMarks})`, values, promiseCb(resolve, reject))
    })
  }

  get(prId) {
    if (LOG_QUERIES) console.log(`db: SELECT ${prId}`)
    return new Promise((resolve, reject) => {
      this.db.get(`SELECT * FROM pulls WHERE prId = ?`, prId, promiseCb(resolve, reject))
    })
  }

  update(prId, data) {
    if (LOG_QUERIES) console.log(`db: UPDATE ${prId} SET ${JSON.stringify(data)}`)
    return new Promise((resolve, reject) => {
      const values = _.map(data, (value, key) => [key, '"' + value + '"'].join(' = ')).join(', ')
      this.db.run(`UPDATE pulls SET ${values} WHERE prId = ?`, prId, promiseCb(resolve, reject))
    })
  }

  delete(prId) {
    if (LOG_QUERIES) console.log(`db: DELETE ${prId}`)
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM pulls WHERE (prId = ?)`, prId, promiseCb(resolve, reject))
    })
  }

  getQueryTemplateParams(obj) {
    const keys = Object.keys(obj)
    const values = keys.map(key => obj[key])
    const questionMarks = [...new Array(keys.length)].map(key => "?").join(', ')
    return { keys, values, questionMarks }
  }

}