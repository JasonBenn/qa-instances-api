import sqlite3 from 'sqlite3'


const createCommand = `
  CREATE TABLE pulls (
    id INTEGER PRIMARY KEY,

    -- properties of the instance
    prId INTEGER, -- e.g., 2300
    prName TEXT, -- e.g., features/hc-index
    sha TEXT, -- (short) e.g., c38d1a9
    dbName TEXT, -- prName, snake-cased so it's a valid MySQL table name
    hostName TEXT, -- prName, hyphen-cased so it's a valid AWS subdomain
    domainName TEXT, -- hostName + ".minervaproject.com"
    instanceId TEXT, -- Opsworks ID of created instance
    publicIp TEXT, -- IPv4 address

    -- all States are one of offline|starting|online|stopping|error. used in UI.
    overallState TEXT,
    dbState TEXT,
    instanceState TEXT,
    deployInstanceState TEXT,
    route53State TEXT,
    startInstanceState TEXT,
    serviceInstanceState TEXT,

    -- error messages in case of error State
    overallError TEXT,
    dbError TEXT,
    instanceError TEXT,
    deployInstanceError TEXT,
    route53Error TEXT,
    startInstanceError TEXT,
    serviceInstanceError TEXT,

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
