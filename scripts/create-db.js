import sqlite3 from 'sqlite3'

const command = `
  CREATE TABLE pulls (
    id INTEGER PRIMARY KEY,
    pr_id INTEGER, -- should match github
    pr_name TEXT, -- should match github
    hostname TEXT, -- (normalized to be valid for AWS)
    db_name TEXT, -- normalized to be valid for RDS, might entail truncation
    state TEXT, -- { stopped|setting-up|deploying|created }
    db_username TEXT,
    url TEXT, -- url
    SHA TEXT, -- of most recent deploy
    deploying BOOLEAN,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`

const db = new sqlite3.Database("db.sqlite")
db.run(command)
