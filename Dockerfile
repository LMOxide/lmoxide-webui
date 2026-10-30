# syntax=docker/dockerfile:1
# The web UI as a small static file server on port 8080 (Caddy, unprivileged).
#   docker build -t lmoxide-webui .
# It calls the API at /api on its own origin: put it behind the same reverse proxy as the API
# (lmoxide's docker-compose.yml does). VITE_API_URL builds it for an API on another origin.

FROM node:24-alpine AS build
RUN npm install -g pnpm@10
WORKDIR /src
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_URL=""
ARG VITE_DISCORD_INVITE=""
# unset build arguments must stay unset: Vite would take an empty VITE_API_URL as the origin's root
RUN [ -n "$VITE_API_URL" ] || unset VITE_API_URL; \
    [ -n "$VITE_DISCORD_INVITE" ] || unset VITE_DISCORD_INVITE; \
    pnpm build

FROM caddy:2-alpine
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist/ /srv/
RUN adduser -D -H -u 10003 web && mkdir -p /data /config && chown web /data /config
USER web
EXPOSE 8080
