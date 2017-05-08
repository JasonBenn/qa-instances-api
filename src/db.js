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

  getQueryTemplateParams(obj) {
    const keys = Object.keys(obj)
    const values = keys.map(key => obj[key])
    const questionMarks = [...new Array(keys.length)].map(key => "?").join(', ')
    return { keys, values, questionMarks }
  }

}