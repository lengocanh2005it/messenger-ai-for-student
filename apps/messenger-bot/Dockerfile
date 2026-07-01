# syntax=docker/dockerfile:1
# Build context: repo root (needs access to packages/llm-agent)
# docker build -f apps/messenger-bot/Dockerfile .

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/messenger-bot/package.json apps/messenger-bot/package.json
COPY packages/llm-agent/package.json packages/llm-agent/package.json
RUN npm ci --ignore-scripts

COPY . .
RUN npx turbo run build --filter=@wispace/messenger-bot... && npm ci --omit=dev --ignore-scripts

FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache docker-cli docker-cli-compose curl bash gnupg \
  && curl -LsSf https://cli.doppler.com/install.sh | sh -s -- --install-path /usr/local/bin \
  && addgroup -g 1001 -S app \
  && adduser -S app -u 1001 -G app

COPY --from=build --chown=app:app /app/apps/messenger-bot/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/apps/messenger-bot/package.json ./package.json

USER app

EXPOSE 5007

CMD ["node", "dist/main.js"]
