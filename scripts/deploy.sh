# /bin/bash

# Install Node v6
sudo apt-key adv --keyserver keyserver.ubuntu.com --recv 68576280
sudo apt-add-repository "deb https://deb.nodesource.com/node_6.x $(lsb_release -sc) main"
sudo apt-get update
sudo apt-get install nodejs

# Need to run twice, for some reason
sudo npm install -g npm

# Dumb solution to cloning a private repo: use your own login credentials
git clone https://github.com/minervaproject/qa-instances-api.git

# Install dependencies
sudo apt-get install sqlite3 pv
npm install

# Add node_module exectables to path
PATH="/home/ubuntu/qa-instances/node_modules/.bin:$PATH"

# Start DB if none exists
# babel-node scripts/create-api-db.js

# Run these from your computer
# scp -i ~/.ssh/staging.pem ./config/aws.json ubuntu@qa-instance-coordinator1.vpcstaging:/home/ubuntu/qa-instances-api/config
# scp -i ~/.ssh/staging.pem ./config/picasso.json ubuntu@qa-instance-coordinator1.vpcstaging:/home/ubuntu/qa-instances-api/config

# Start app
npm run build
npm run serve
