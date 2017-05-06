# /bin/bash

echo "forever stopall"
forever stopall
echo "yarn install --pure-lockfile"
yarn install --pure-lockfile  # don't generate a new lockfile (yarn install yields different package orderings on Ubuntu and OSX, and we want a clean git status)
echo "scp config"
scp -i ~/.ssh/staging.pem -r config ubuntu@qa-instance-coordinator1.vpcstaging:/home/ubuntu/qa-instances-api/
echo "npm run build"
npm run build
echo "npm run serve"
npm run serve