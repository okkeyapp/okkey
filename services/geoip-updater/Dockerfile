# node:25-alpine
FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY update.mjs ./
CMD ["node", "update.mjs"]
