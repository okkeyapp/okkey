FROM node:25-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY update.mjs ./
CMD ["node", "update.mjs"]
