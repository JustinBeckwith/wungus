FROM node:20.12.2-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20.12.2-slim
WORKDIR /app
COPY --from=builder /app /app
COPY package*.json ./
ENV NODE_ENV="production"
RUN npm ci --omit=dev
EXPOSE 8080
CMD [ "npm", "run", "start" ]
