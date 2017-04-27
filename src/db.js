import SQLite3 from 'sqlite3'


export default class DB {
  constructor() {
    this.db = new SQLite3.Database("db.sqlite")
  }

  all() {
    return new Promise(function(resolve, reject) {
      this.db.all(`SELECT * FROM pulls`, undefined, promiseCb(resolve, reject))
    })
  }

  create(data) {
    const { keys, questionMarks, values } = this.getQueryTemplateParams(data)
    return new Promise(function(resolve, reject) {
      this.db.run(`INSERT OR IGNORE INTO pulls (${keys}) VALUES (${questionMarks})`, values, promiseCb(resolve, reject))
    })
  }

  get(id) {
    return new Promise(function(resolve, reject) {
      this.db.get(`SELECT * FROM pulls WHERE prId = ?`, prId, promiseCb(resolve, reject))
    })
  }

  update(id, data) {
    return new Promise(function(resolve, reject) {
      const values = _.map(data, (value, key) => [key, value].join(' = ')).join(', ')
      // Why isn't this ever getting logged locally?
      console.log(values)
      this.db.run('UPDATE pulls SET ' + values + ' WHERE prId = ?', prId, promiseCb(resolve, reject))
    })
  }

  delete(id) {
    return new Promise(function(resolve, reject) {
      this.db.run(`DELETE FROM pulls WHERE (prId = ?)`, req.params.prId, promiseCb(resolve, reject))
    })
  }

  getQueryTemplateParams(obj) {
    const keys = Object.keys(data)
    const values = keys.map(key => data[key])
    const questionMarks = Array.new(keys.length).map(() => "?").join(', ')
    return { keys, values, questionMarks }
  }

}