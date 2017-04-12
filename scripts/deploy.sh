# /bin/bash

# Install Node v6
sudo apt-key adv --keyserver keyserver.ubuntu.com --recv 68576280
sudo apt-add-repository "deb https://deb.nodesource.com/node_6.x $(lsb_release -sc) main"
sudo apt-get update
sudo apt-get install nodejs

# Need to run twice, for some reason
sudo npm install -g npm

# Dumb solution to cloning a private repo: use your own login credentials
git clone https://github.com/minervaproject/qa-instances.git

# Install dependencies
sudo apt-get install sqlite3
npm install

# Add node_module exectables to path
PATH="/home/ubuntu/qa-instances/node_modules/.bin:$PATH"

# Start DB
babel-node scripts/create-db.js

# Start app
npm run build
npm run serve
