# syntax=docker/dockerfile:1
# Sky Top API — production image.
#
#   docker build -t skytop-backend server/                  # runtime (default)
#   docker build --target migrate -t skytop-migrate server/ # prisma migrate deploy
#
# Stages: build (all dependencies, prisma generate, tsc) → migrate (build +
# Prisma CLI, runs `prisma migrate deploy` only when invoked) → prod-deps →
# runtime (production dependencies + compiled JavaScript, non-root). No secrets are
# baked in: every setting comes from the container environment at run time.

FROM node:22-bookworm-slim AS base
# OpenSSL is required by the Prisma query engine.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# One-shot schema migration: `docker compose run --rm migrate`. Never resets.
FROM build AS migrate
RUN groupadd --system --gid 10001 skytop \
 && useradd --system --uid 10001 --gid skytop --no-create-home --shell /usr/sbin/nologin skytop
ENV NODE_ENV=production
USER skytop
CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]

# Production dependencies only. The Prisma CLI and TypeScript are optional
# peers of @prisma/client (lockfile: "devOptional"), so --omit=dev alone keeps
# them; --omit=optional drops them (the server has no other optional
# dependencies). The generated Prisma client + query engine come from build.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional && npm cache clean --force
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    UPLOAD_DIR=/var/lib/skytop/uploads
RUN groupadd --system --gid 10001 skytop \
 && useradd --system --uid 10001 --gid skytop --no-create-home --shell /usr/sbin/nologin skytop \
 && mkdir -p /var/lib/skytop/uploads \
 && chown skytop:skytop /var/lib/skytop/uploads \
 && chmod 700 /var/lib/skytop/uploads
# Application files stay owned by root: the API user can read, not modify them.
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build --exclude=**/*.map /app/dist ./dist
USER skytop
EXPOSE 4000
# Readiness (API + database). Liveness only: /api/v1/health/live.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Exec form: node is PID 1's child (compose `init: true`) and receives SIGTERM
# directly → graceful shutdown (src/server.ts).
CMD ["node", "dist/src/server.js"]
