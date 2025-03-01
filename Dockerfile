FROM node:20.12.2-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:20.12.2-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY --from=builder /app /app
COPY package.json pnpm-lock.yaml ./
ENV NODE_ENV="production"
RUN pnpm install --frozen-lockfile --prod
EXPOSE 8080
CMD [ "pnpm", "run", "start" ]
