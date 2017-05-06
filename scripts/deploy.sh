# /bin/bash

forever stopall
yarn install
npm run build
npm run serve
