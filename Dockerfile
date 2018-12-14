FROM node:latest

ENV NODE_PATH=/usr/local/lib/node_modules

RUN npm config set user 0 \
    && npm config set unsafe-perm true \
    && npm install -g websocket \
    && npm install -g node-hue-api