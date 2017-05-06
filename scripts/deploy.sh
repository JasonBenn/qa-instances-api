# /bin/bash

forever stopall
yarn install --pure-lockfile  # don't generate a new lockfile (yarn install yields different package orderings on Ubuntu and OSX, and we want a clean git status)
npm run build
npm run serve
