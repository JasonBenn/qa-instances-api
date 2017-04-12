# /bin/bash

# Install Node and NPM
sudo apt-get install nodejs
sudo apt-get install npm
sudo ln -s /usr/bin/nodejs /usr/bin/node

git clone https://github.com/minervaproject/qa-instances.git

# Install dependencies
npm install

# Start DB
babel-node create-db.js

# Start app
npm start