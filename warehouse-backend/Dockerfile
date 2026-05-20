FROM node:20-alpine
RUN apk add --no-cache python3 make g++ py3-setuptools
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN rm -rf /app/node_modules/.cache
EXPOSE 3003
CMD ["node", "index.js"]
