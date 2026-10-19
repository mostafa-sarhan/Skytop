# syntax=docker/dockerfile:1
# Sky Top web client — production image: Vite build served by unprivileged
# Nginx on port 8080. The bundle calls the API at the relative path /api
# (same origin; the host Nginx routes /api/ to the backend), so no API URL or
# secret is baked in. Source maps are disabled in vite.config.ts.

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && ! find dist -name '*.map' | grep -q .

FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
