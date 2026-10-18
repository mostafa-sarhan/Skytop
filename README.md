# Skytop

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
