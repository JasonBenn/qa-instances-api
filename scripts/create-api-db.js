import sqlite3 from 'sqlite3'


const createCommand = `
  CREATE TABLE pulls (
    id INTEGER PRIMARY KEY,
    prId INTEGER, -- should match github
    prName TEXT, -- should match github
    hostName TEXT, -- (normalized to be valid for AWS)
    dbName TEXT, -- normalized to be valid for RDS, might entail truncation
    instanceState TEXT, -- starting|online|stopping (when no row is found, instance is assumed offline)
    deployState TEXT, -- stopped|setting-up|deploying|created
    route53State TEXT,
    url TEXT, -- url
    sha TEXT, -- of most recent deploy
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(prId),
    UNIQUE(hostName)
  );
`

const db = new sqlite3.Database("db.sqlite")
db.run("DROP TABLE IF EXISTS pulls;", (err) => {
  if (err) return console.log(err);
  db.run(createCommand)
})
