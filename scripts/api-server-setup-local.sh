# This file is for first-time API server setup. Run from the machine being set up.

# Install Node & npm
sudo apt-key adv --keyserver keyserver.ubuntu.com --recv 68576280
sudo apt-add-repository "deb https://deb.nodesource.com/node_6.x $(lsb_release -sc) main"
sudo apt-get update
sudo apt-get install nodejs
sudo npm install -g npm

# Add node_module exectables to path
PATH="/home/ubuntu/qa-instances/node_modules/.bin:$PATH"

# Install other dependencies
sudo apt-get install sqlite3 pv
npm install -g yarn
yarn install

# create DB
babel-node scripts/create-api-db.js

# create ~/.ssh/config
echo """Host *.vpcstaging
    StrictHostKeyChecking no
    IdentityFile ~/.ssh/staging.pem
    User ubuntu""" > ~/.ssh/config
