# /bin/bash

forever stopall
yarn install --pure-lockfile  # don't generate a new lockfile (yarn install yields different package orderings on Ubuntu and OSX, and we want a clean git status)
scp -i ~/.ssh/staging.pem -r config ubuntu@qa-instance-coordinator1.vpcstaging:/home/ubuntu/qa-instances-api/
npm run build
npm run serve