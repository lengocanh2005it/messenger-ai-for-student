# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm ci --omit=dev

FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache docker-cli docker-cli-compose curl bash gnupg \
  && curl -LsSf https://cli.doppler.com/install.sh | sh -s -- --install-path /usr/local/bin \
  && addgroup -g 1001 -S app \
  && adduser -S app -u 1001 -G app

COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json

USER app

EXPOSE 5007

CMD ["node", "dist/main.js"]
