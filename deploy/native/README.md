# Sky Top — native deployment (fallback, without Docker)

> **The primary production method is Docker — see [`../README.md`](../README.md).**
> This guide is kept as a fallback for a VPS where Docker cannot be used.
> Do not mix the two on one server: both use port 4000, `/var/lib/skytop/uploads`
> and `/var/backups/skytop`.

This guide deploys Sky Top on **one Ubuntu VPS** (Hostinger KVM, Ubuntu 24.04
LTS recommended). Everything runs on the same machine; no Docker.

```
Internet ──HTTPS──▶ Nginx (443) ──┬── /            client/dist (static SPA, React Router fallback)
                                  └── /api/        127.0.0.1:4000  Node.js API (systemd: skytop-api)
                                                        │
                                                        ├── PostgreSQL 16 (127.0.0.1:5432, database "skytop")
                                                        └── /var/lib/skytop/uploads (private files, API-only)
```

| What | Where | Owner / mode |
| --- | --- | --- |
| Code (git checkout) | `/opt/skytop/app` | `skytop:skytop` |
| API environment (secrets) | `/etc/skytop/server.env` | `root:skytop` `0640` |
| Private uploads (passports, photos, receipts, invoices) | `/var/lib/skytop/uploads` | `skytop:skytop` `0700` |
| Backups | `/var/backups/skytop` | `root:root` `0700` |
| Client build served by Nginx | `/opt/skytop/app/client/dist` | built by `release.sh` |
| API logs | `journalctl -u skytop-api` (JSON lines) | — |

Files in this folder:

| File | Purpose |
| --- | --- |
| `env/server.env.example` | template for `/etc/skytop/server.env` |
| `systemd/skytop-api.service` | API service (compiled build, hardened, graceful stop) |
| `nginx/skytop.conf`, `nginx/skytop-security-headers.conf` | site + security headers (CSP, HSTS…) |
| `scripts/release.sh` | backup → build → `prisma migrate deploy` → swap client → restart → health |
| `scripts/backup.sh`, `scripts/restore.sh` | database + uploads backup / verified restore into new targets |
| `scripts/healthcheck.sh` | waits for `/api/v1/health` |
| `cron/skytop-backup` | nightly backup at 02:30 |

Replace these placeholders everywhere: **`YOUR_DOMAIN`** (e.g. `app.example.com`),
**`YOUR_REPO_URL`**, **`YOUR_EMAIL`** (Let's Encrypt notices). Generate every
secret on the server; never reuse development values.

---

## 1. Server preparation (once)

```bash
# As root (or with sudo) on the VPS
apt update && apt -y upgrade
apt -y install curl git ufw nginx postgresql postgresql-contrib ca-certificates gnupg
timedatectl set-timezone Africa/Cairo        # dates/backups in local time

# Firewall: SSH + HTTP/HTTPS only (the API port 4000 and PostgreSQL stay private)
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Node.js 22 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt -y install nodejs
node -v      # v22.x
which node   # /usr/bin/node (used by the systemd unit)

# Service user (no login shell, no password)
adduser --system --group --home /opt/skytop --shell /usr/sbin/nologin skytop
```

## 2. PostgreSQL

```bash
DB_PASSWORD="$(openssl rand -hex 24)"; echo "keep this: $DB_PASSWORD"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE skytop LOGIN PASSWORD '$DB_PASSWORD';
CREATE DATABASE skytop OWNER skytop ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE skytop FROM PUBLIC;
SQL
```

PostgreSQL listens on localhost only by default (`listen_addresses = 'localhost'`) — keep it that way.

## 3. Directories and code

```bash
mkdir -p /opt/skytop /etc/skytop /var/lib/skytop/uploads /var/backups/skytop /var/www/certbot
chown -R skytop:skytop /opt/skytop /var/lib/skytop
chmod 700 /var/lib/skytop/uploads /var/backups/skytop

sudo -u skytop git clone YOUR_REPO_URL /opt/skytop/app
```

Uploads live **outside** the code folder, so releases, `git clean` or a new checkout never touch them.

## 4. API environment

```bash
cp /opt/skytop/app/deploy/native/env/server.env.example /etc/skytop/server.env
chown root:skytop /etc/skytop/server.env && chmod 640 /etc/skytop/server.env
openssl rand -hex 32          # → JWT_SECRET
nano /etc/skytop/server.env   # DATABASE_URL (password from step 2), JWT_SECRET, YOUR_DOMAIN
```

The API validates this file at start-up and **refuses to start** when anything is
missing or unsafe (placeholder or short JWT secret, `COOKIE_SECURE` not `true`,
wildcard / missing `CORS_ORIGIN`, relative `UPLOAD_DIR`, unset `TRUST_PROXY`).
In production the API reads **only** this environment — a stray `server/.env` is ignored.

## 5. Build, migrate, bootstrap the first manager

```bash
cd /opt/skytop/app/server
sudo -u skytop npm ci --no-audit --no-fund
sudo -u skytop npx prisma generate
sudo -u skytop npm run build                 # → dist/src/server.js

# Database schema — production ALWAYS uses migrate deploy (never migrate reset / db push)
sudo -u skytop bash -c 'set -a; . /etc/skytop/server.env; set +a; npx prisma migrate deploy'

# First manager (username ≥ 6 chars; password ≥ 10 with upper, lower, digit, special)
read -rp 'Manager username: ' SEED_MANAGER_USERNAME
read -rsp 'Manager password: ' SEED_MANAGER_PASSWORD; echo
sudo -u skytop env SEED_MANAGER_USERNAME="$SEED_MANAGER_USERNAME" SEED_MANAGER_PASSWORD="$SEED_MANAGER_PASSWORD" \
  bash -c 'set -a; . /etc/skytop/server.env; set +a; npx tsx prisma/seed.ts'
unset SEED_MANAGER_PASSWORD
# Employees are then created from the Users page (they must change their password on first login).
# NEVER run `npm run seed:demo` in production (it refuses NODE_ENV=production anyway).

cd /opt/skytop/app/client
sudo -u skytop npm ci --no-audit --no-fund
sudo -u skytop npm run build                 # → client/dist (no source maps, no API URL baked in)
```

## 6. API service (systemd)

```bash
cp /opt/skytop/app/deploy/native/systemd/skytop-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now skytop-api
systemctl status skytop-api --no-pager
/opt/skytop/app/deploy/native/scripts/healthcheck.sh          # healthy: {"status":"ok","database":"ok",…}
journalctl -u skytop-api -n 20 --no-pager
```

**Why systemd (not PM2):** one process, already on every Ubuntu server, restarts
on failure, sends SIGTERM for a graceful stop, keeps logs in journald, and
sandboxes the process (read-only system, only the uploads folder writable).
PM2 would add a second process manager without a benefit here.

The API listens on `127.0.0.1:4000` only. On `systemctl restart` it stops
accepting connections, finishes in-flight requests, disconnects from
PostgreSQL and exits (forced after 10 s).

## 7. Nginx + HTTPS (Let's Encrypt)

DNS first: an `A` record (and `AAAA` if you use IPv6) for `YOUR_DOMAIN` pointing to the VPS.

```bash
apt -y install certbot
cp /opt/skytop/app/deploy/native/nginx/skytop-security-headers.conf /etc/nginx/snippets/
cp /opt/skytop/app/deploy/native/nginx/skytop.conf /etc/nginx/sites-available/skytop
sed -i 's/YOUR_DOMAIN/app.example.com/g' /etc/nginx/sites-available/skytop   # your real domain
rm -f /etc/nginx/sites-enabled/default

# Bootstrap: the HTTPS block needs certificates that do not exist yet.
# Temporarily enable only the port-80 block (ACME challenge):
cat > /etc/nginx/sites-enabled/skytop-bootstrap <<'NGINX'
server { listen 80; listen [::]:80; server_name _;
  location /.well-known/acme-challenge/ { root /var/www/certbot; }
  location / { return 503; } }
NGINX
nginx -t && systemctl reload nginx

certbot certonly --webroot -w /var/www/certbot -d YOUR_DOMAIN \
  --email YOUR_EMAIL --agree-tos --no-eff-email

rm /etc/nginx/sites-enabled/skytop-bootstrap
ln -s /etc/nginx/sites-available/skytop /etc/nginx/sites-enabled/skytop
nginx -t && systemctl reload nginx

# Renewal is automatic (certbot.timer); reload Nginx after each renewal:
echo -e '#!/bin/sh\nsystemctl reload nginx' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
certbot renew --dry-run
```

What the Nginx site does: HTTP → HTTPS redirect; TLS 1.2/1.3; HSTS; static client
with SPA fallback; `/assets/*` cached for a year (hashed names); `index.html`
never cached; `/api/` proxied to Node with `X-Forwarded-For` **overwritten** by
`$remote_addr` (the API trusts it only from loopback → real client IPs for rate
limits, unspoofable) and `X-Request-Id: $request_id` (appears in API logs and
error bodies); uploads up to 20 MB per request; dotfiles denied; strict
Content-Security-Policy (no inline scripts — the theme bootstrap is
`/theme-init.js`). Private files are **never** served by Nginx.

## 8. Backups

```bash
cp /opt/skytop/app/deploy/native/cron/skytop-backup /etc/cron.d/skytop-backup
chmod 644 /etc/cron.d/skytop-backup
/opt/skytop/app/deploy/native/scripts/backup.sh          # first run now
ls -l /var/backups/skytop/daily/
```

Every night at 02:30: `pg_dump` (custom format, verified with `pg_restore --list`)
+ `tar.gz` of the uploads (verified) + `SHA256SUMS`, in
`/var/backups/skytop/daily/skytop-YYYYmmdd-HHMMSS/`. Keeps **7 daily** and
**4 weekly** (Sunday) copies (`KEEP_DAILY`, `KEEP_WEEKLY`). No password is in
the script: it reads `DATABASE_URL` / `UPLOAD_DIR` from `/etc/skytop/server.env`.

**Off-site copy (strongly recommended):** a backup on the same disk does not
survive losing the VPS. Copy `/var/backups/skytop` daily to another place
(another server via `rsync`, or object storage via `rclone`) once you choose a
provider, and enable Hostinger's VPS snapshots as an extra layer.

## 9. Restore (rehearse it before you need it)

`restore.sh` never overwrites live data: it restores into a **new** database and
a **new** uploads folder, verifying checksums first.

```bash
B=/var/backups/skytop/daily/skytop-20261019-023000          # pick a backup
/opt/skytop/app/deploy/native/scripts/restore.sh "$B" skytop_restored /var/lib/skytop/uploads-restored
```

To switch production to the restored copy:

```bash
systemctl stop skytop-api                                    # 1. stop the API
sudo -u postgres psql -c 'ALTER DATABASE skytop RENAME TO skytop_old_20261019'
sudo -u postgres psql -c 'ALTER DATABASE skytop_restored RENAME TO skytop'   # 2. database
mv /var/lib/skytop/uploads /var/lib/skytop/uploads-old-20261019
mv /var/lib/skytop/uploads-restored /var/lib/skytop/uploads                  # 3. uploads
cd /opt/skytop/app/server && sudo -u skytop bash -c 'set -a; . /etc/skytop/server.env; set +a; npx prisma migrate deploy'   # 4. migrations
systemctl start skytop-api                                   # 5. start
/opt/skytop/app/deploy/native/scripts/healthcheck.sh                # 6. health
```

7–9. Smoke test in the browser: log in (manager and employee), open a pilgrim
file and view its passport image, open a payment receipt scan, open
حسابات المناديب and an account statement PDF. Keep the `*_old_*` database and
folder until you are sure, then drop / delete them.

Restore was rehearsed locally (demo data: 925 pilgrims, 246 payments, 2 034 files):
identical row counts, payment totals and file contents, `migrate deploy`
reported nothing pending, and the API served health, login, documents and
accounts from the restored copy.

## 10. Releasing updates

```bash
cd /opt/skytop/app && sudo -u skytop git pull --ff-only
sudo /opt/skytop/app/deploy/native/scripts/release.sh
```

`release.sh`: backup → server `npm ci` + build → `prisma migrate deploy` →
client build into `dist-next` and atomic swap (previous build kept in
`dist-prev`) → `systemctl restart skytop-api` → health check. Rollback: check
out the previous commit and run `release.sh` again (migrations are forward-only;
restore a backup if a migration must be undone).

## 11. Verify production

```bash
/opt/skytop/app/deploy/native/scripts/healthcheck.sh https://YOUR_DOMAIN
curl -sI https://YOUR_DOMAIN | grep -iE 'strict-transport|content-security|x-frame'
curl -sI https://YOUR_DOMAIN/api/v1/health | grep -iE 'x-request-id|x-powered-by'   # request id yes, powered-by no
curl -s -o /dev/null -w '%{http_code}\n' https://YOUR_DOMAIN/.env                   # 403
systemctl is-active skytop-api nginx postgresql
journalctl -u skytop-api --since '10 min ago' --no-pager | tail
```

Then in the browser (as the manager, then as an employee): log in → dashboard →
add a delegate and a trip → add a pilgrim with a passport image → open the
passport image → record a payment with a receipt scan → account statement PDF →
Excel export → audit log shows the actions.

## Operations notes

* **Logs:** `journalctl -u skytop-api -f` — one JSON line per request
  (`requestId`, method, path without query string, status, duration, user id,
  client IP). Passwords, tokens, cookies, secrets and file contents are never
  logged. A user can quote the `requestId` shown in an error.
* **Health:** `GET /api/v1/health` (API + database, 503 when the database is
  unreachable or the API is stopping) and `GET /api/v1/health/live` (process only).
* **Rate limits** are in memory (correct for one API process; they reset on
  restart). Limits are per client IP — an office behind one router shares one
  IP, which `RATE_LIMIT_MAX=1200`/min accounts for. Login: 10/min per IP, and an
  account is locked for 15 min after `LOGIN_FAILURES_PER_ACCOUNT` (10) wrong
  passwords. If the API is ever scaled to several processes, switch the limiter
  to Redis (`server/src/middlewares/rateLimit.ts`).
* **Sessions:** 12 h cookies (`HttpOnly`, `Secure`, `SameSite=Lax`). Changing a
  password, a manager reset and deactivating an account end that user's other
  sessions immediately. Rotating `JWT_SECRET` signs everyone out.
* **Legacy usernames** shorter than 6 characters keep working; list them with
  `cd /opt/skytop/app/server && sudo -u skytop bash -c 'set -a; . /etc/skytop/server.env; set +a; npm run report:usernames'`
  and rename them from the Users page if desired.
* **Never** run `prisma migrate reset`, `prisma db push` or `npm run seed:demo` on production.
