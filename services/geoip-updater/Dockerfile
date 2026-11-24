# node:25-alpine
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY update.mjs ./
CMD ["node", "update.mjs"]
