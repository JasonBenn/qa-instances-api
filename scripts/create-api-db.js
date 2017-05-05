import sqlite3 from 'sqlite3'


const createCommand = `
  CREATE TABLE pulls (
    id INTEGER PRIMARY KEY,
    prId INTEGER, -- should match github
    prName TEXT, -- should match github
    sha TEXT, -- of most recent deploy

    dbName TEXT, -- normalized to be valid for RDS, might entail truncation
    dbState TEXT, -- starting|online|stopping|error
    dbErrorMessage, -- set when dbState is "error"

    hostName TEXT, -- (normalized to be valid for AWS)
    instanceState TEXT, -- starting|online|stopping|offline (and when no row is found, instance is assumed offline)
    instanceId TEXT, -- Opsworks ID

    deployState TEXT, -- stopped|setting-up|deploying|created

    route53State TEXT,
    url TEXT, -- url

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
