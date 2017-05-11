![image](https://cloud.githubusercontent.com/assets/2539761/25288498/197cfc4e-269c-11e7-923f-7e83fcd595ac.png)

# QA Instances - API Server

This is the API server code for the QA instances project.
The Chrome extension is [here](https://github.com/minervaproject/qa-instances-extension).

# Local development

### First time:
> Install local QA instance coordinator nginx config and /etc/hosts line with ./nginx/install-local (you may need to update the nginx path for your system)
> - You may also need to disable your seminar-local setup, which also conflicts with this setup. On my system, `mv /usr/local/etc/nginx/sites-enabled/picasso.conf /usr/local/etc/nginx/sites-enabled/picasso.conf.backup; sudo nginx -s reload` is sufficient to get Picasso out of the way. Better solutions would be greatly appreciated.

### Every time:
```
nvm use `cat .node-version`
npm run start
```
Also, set the `local` boolean in config/picasso.json to `true` when developing locally - this will mock out AWS API calls.

### To test that your local install is working:
```
https://qa-instance-coordinator-local.minervaproject.com
```

If you get a 404 or 500 error:
```
mv /usr/local/etc/nginx/picasso.conf mv /usr/local/etc/nginx/picasso.conf.backup
```
(Sorry. I don't know why they conflict yet.)

# Useful tidbits

### Useful commands:
* Deploy an update to the API server: `npm run deploy`
* Tail logs on the API server: `tail -f ~/qa-instances-api/logs`
* Reset local database: `npm run redb`
* Print local database: `npm run printTable` and `npm run printTallTable`

### Half-baked commands:
* `bash ./scripts/deploy.sh` is meant to be run from a qa-instance-coordinator instance, but mostly I've been iterating on the instance setup ad-hoc-style... the script is probably incomplete.

### Config files (as of `#d1c0a1d`):
* aws.json: `{ "region" "accessKeyId" "secretAccessKey" }`
* picasson.json: `{ "repoName" "region" "stackId" "layerId" "appId" "route53HostedZoneID" }`

# Architecture

### Division of responsibilities

`src/app.js`: app entry point. Initializes instances of `AWS`, `DB`, `PubSub`, and `QaInstances` classes and passes them to the `routes` function.
`src/routes.js`: registers route handlers on the Express server instance. These handlers mostly just parse inputs, pass them to `QaInstances` instance, and return HTTP responses.
`src/qa-instances.js`: specifies the sequence of AWS API calls, DB calls, and PubSub messages. Forms the bulk of the code.
`src/aws.js`: wrappers for AWS API calls.
`src/db.js`: CRUD wrappers for the `pulls` table (see Data Model section).
`src/pubsub.js`: listens for websocket connect and disconnect events, storing them in an array; defines `publish` and `saveThenPublish` methods, which publish data to each connected client either immediately or after a DB update.
`src/utils.js`: function junk drawer.

### Data model

There is one database table: `pulls`.

About a third of the fields are properties of the instance:
```
prId INTEGER, -- e.g., 2300
prName TEXT, -- e.g., features/hc-index
sha TEXT, -- (short) e.g., c38d1a9
dbName TEXT, -- prName, snake-cased so it's a valid MySQL table name
hostName TEXT, -- prName, hyphen-cased so it's a valid AWS subdomain
domainName TEXT, -- hostName + ".minervaproject.com"
instanceId TEXT, -- Opsworks ID of created instance
publicIp TEXT, -- IPv4 address
```

Another third are states {offline|starting|online|stopping|error} that each map to one line of the UI.
```
overallState TEXT,
dbState TEXT,
instanceState TEXT,
deployInstanceState TEXT,
route53State TEXT,
startInstanceState TEXT,
serviceInstanceState TEXT,
```

The last third are error messages in case of an `error` state above.
```
overallError TEXT,
dbError TEXT,
instanceError TEXT,
deployInstanceError TEXT,
route53Error TEXT,
startInstanceError TEXT,
serviceInstanceError TEXT,
```

There are also progress updates, which are periodically emitted from long-running tasks and forwarded to the frontend for display via pubsub. However, these messages are not database-backed.
```
overallProgress
dbProgress
instanceProgress
deployInstanceProgress
route53Progress
startInstanceProgress
serviceInstanceProgress
```
