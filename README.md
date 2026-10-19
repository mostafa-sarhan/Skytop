# Skytop

## Production

Deployment on a Hostinger VPS with Docker Compose (PostgreSQL, API and web
client containers behind host Nginx + Let's Encrypt; private uploads, backups /
restore, releases and rollback): see [`deploy/README.md`](deploy/README.md).
A non-Docker fallback (systemd) is in [`deploy/native/README.md`](deploy/native/README.md).

## Checks and tests

```bash
cd server && npm run typecheck && npm run build
cd server && npm run test:api            # API integration tests on a dedicated *_test database
cd client && npm run lint && npm run build && npm run check:dialogs
# Browser checks against a running stack (APP_URL, API_URL, CHECK_USER, CHECK_PASSWORD):
cd client && npm run check:ui && ROUTES=all npm run check:rtl
# Production images / compose file:
docker compose -f docker-compose.prod.yml --env-file deploy/env/docker.env.example config --quiet
```

## Demo data (development only)

A large, realistic demo dataset (30 delegates, ~900 pilgrims, 17 trips, payments,
refunds/corrections and company expenses) can be loaded into an **empty**
development database:

```bash
cd server
npx prisma migrate deploy
npm run seed                      # base users + system delegate (SEED_*_PASSWORD from env)
ALLOW_DEMO_SEED=true npm run seed:demo
```

The demo seed refuses to run without `ALLOW_DEMO_SEED=true`, with
`NODE_ENV=production`, on a non-local database host (unless
`DEMO_SEED_ALLOW_REMOTE_DB=true`), or on a database that already contains data.
It never deletes anything. Document, receipt and invoice files are hard links
to four small sample images under `UPLOAD_DIR`.
