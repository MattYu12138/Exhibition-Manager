FROM node:20-alpine
RUN apk add --no-cache python3 py3-setuptools make g++
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN rm -rf /app/node_modules/.cache
EXPOSE 3000
CMD ["node", "src/index.js"]
