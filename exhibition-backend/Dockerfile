FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
# 不复制 node_modules，在容器内重新编译原生模块
RUN npm install --omit=dev
COPY . .
# 排除宿主机的 node_modules
RUN rm -rf /app/node_modules/.cache
EXPOSE 3001
CMD ["node", "index.js"]
