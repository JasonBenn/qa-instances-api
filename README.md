![image](https://cloud.githubusercontent.com/assets/2539761/25288498/197cfc4e-269c-11e7-923f-7e83fcd595ac.png)

# QA Instances - API Server

This is the API server code for the QA instances project.
The Chrome extension is [here](https://github.com/minervaproject/qa-instances-extension).

# Local development

### First time:
```
Install local QA instance coordinator nginx config and /etc/hosts line with ./nginx/install-local (you may need to update the nginx path for your system)
- You may also need to disable your seminar-local setup, which also conflicts with this setup. On my system, `mv /usr/local/etc/nginx/sites-enabled/picasso.conf /usr/local/etc/nginx/sites-enabled/picasso.conf.backup; sudo nginx -s reload` is sufficient to get Picasso out of the way. Better solutions would be greatly appreciated.
```

### Every time:
```
nvm use `cat .node-version`
npm run start
```

Set the `local` boolean in config/picasso.json to `true` when developing locally - this will mock out AWS API calls.

# Useful tidbits

### Useful commands:
* Reset local database: `npm run redb`
* Print local database: `npm run printTable` and `npm run printTallTable`

### Half-baked commands:
* `bash ./scripts/deploy.sh` is meant to be run from a qa-instance-coordinator instance, but mostly I've been iterating on the instance setup ad-hoc-style... the script is probably incomplete.

### Config files (as of `#d1c0a1d`):
* aws.json: `{ "region" "accessKeyId" "secretAccessKey" }`
* picasson.json: `{ "repoName" "region" "stackId" "layerId" "appId" "route53HostedZoneID" }`