# Sky Top — production deployment with Docker (Hostinger VPS)

This is the **primary** way to run Sky Top in production: one Ubuntu VPS
(Hostinger KVM, Ubuntu 24.04 LTS), Docker Compose for the application and the
database, and Nginx + Certbot on the host for the domain and HTTPS.
(A non-Docker fallback is kept in [`native/README.md`](native/README.md); do
not mix the two on one server.)

```
Internet ──HTTPS──▶ host Nginx :443 (TLS, HSTS, Let's Encrypt)
                      ├── /       ─▶ 127.0.0.1:8083 ─▶ frontend  (nginx-unprivileged: Vite build, CSP, caching, SPA fallback)
                      └── /api/   ─▶ 127.0.0.1:4000 ─▶ backend   (Node 22, compiled API, uid 10001)
                                                          │  network "db" (internal, no outside access)
                                                          ▼
                                                       postgres  (PostgreSQL 17, not published)
   volumes:  pgdata (named volume)  ·  /var/lib/skytop/uploads (host folder, backend only)
```

| What | Where | Owner / mode |
| --- | --- | --- |
| Code (git checkout) | `/opt/skytop/app` | `root` |
| Settings + secrets for compose | `/etc/skytop/docker.env` | `root:root` `0600` |
| Database files | Docker volume `skytop_pgdata` | Docker |
| Private uploads (passports, photos, receipts, invoices) | `/var/lib/skytop/uploads` | `10001:10001` `0700` |
| Backups | `/var/backups/skytop` | `root:root` `0700` |
| Logs | `deploy/scripts/compose.sh logs` (JSON lines, rotated 5 × 10 MB per container) | — |

Files:

| File | Purpose |
| --- | --- |
| `docker-compose.prod.yml` (repo root) | the stack: `postgres`, `backend`, `frontend`, one-shot `migrate` |
| `server/Dockerfile` | API image (`runtime`) and migration image (`migrate`) |
| `client/Dockerfile`, `client/nginx/*.conf` | web client image (static files + security headers) |
| `deploy/env/docker.env.example` | template for `/etc/skytop/docker.env` |
| `deploy/nginx/skytop.conf` | host Nginx site (HTTPS, proxy to the two containers) |
| `deploy/nginx/skytop-bootstrap.conf` | HTTP-only site used once to obtain the first certificate |
| `deploy/scripts/compose.sh` | `docker compose` with the right file, env file and project name |
| `deploy/scripts/release.sh` | backup → build → migrate → restart backend / frontend → health |
| `deploy/scripts/rollback.sh` | run the images of an earlier release |
| `deploy/scripts/backup.sh`, `restore.sh` | database + uploads backup / verified restore into new targets |
| `deploy/scripts/healthcheck.sh` | waits for `/api/v1/health` |
| `deploy/cron/skytop-backup` | nightly backup at 02:30 |

Replace these placeholders: **`YOUR_DOMAIN`** (e.g. `app.example.com`),
**`YOUR_REPO_URL`**, **`YOUR_EMAIL`** (Let's Encrypt notices). Generate every
secret on the server; never reuse development values. All commands run as
root (`sudo -i`): Docker access is root-equivalent.

**VPS size:** at rest the three containers use ≈ 100 MB of RAM (API ≈ 50 MB,
PostgreSQL ≈ 25 MB, web ≈ 15 MB) plus PostgreSQL's cache as data grows; PDF /
Excel reports briefly use more CPU and memory. Image builds on the server
(`npm ci`, TypeScript, Vite) are the peak: plan **2 vCPU / 4 GB RAM or more**
(Hostinger KVM 2) and **≥ 20 GB free disk** (images of the last 5 releases,
build cache, backups, uploads). No container memory limits are set; add them
only after watching real usage (`docker stats`).

---

## 1. Server preparation (once)

```bash
apt update && apt -y upgrade
apt -y install ca-certificates curl git ufw nginx certbot
timedatectl set-timezone Africa/Cairo        # dates / backup times in local time

# Firewall: SSH + HTTP/HTTPS only.
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

Docker Engine + Compose plugin from Docker's repository (skip if the VPS was
created from Hostinger's "Ubuntu 24.04 with Docker" template):

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker version && docker compose version     # Compose v2.33+ (uses gw_priority)
```

> **Docker and UFW:** ports Docker publishes bypass UFW rules. That is why every
> port in `docker-compose.prod.yml` is bound to `127.0.0.1` and PostgreSQL is
> not published at all. Never change a mapping to `0.0.0.0` / a bare port.

## 2. Directories, code, settings

```bash
mkdir -p /etc/skytop /var/lib/skytop/uploads /var/backups/skytop /var/www/certbot
chown 10001:10001 /var/lib/skytop/uploads       # the API container's user
chmod 700 /var/lib/skytop/uploads /var/backups/skytop

git clone YOUR_REPO_URL /opt/skytop/app

cp /opt/skytop/app/deploy/env/docker.env.example /etc/skytop/docker.env
chmod 600 /etc/skytop/docker.env
openssl rand -hex 24          # → POSTGRES_PASSWORD
openssl rand -hex 32          # → JWT_SECRET
nano /etc/skytop/docker.env   # POSTGRES_PASSWORD, JWT_SECRET, CORS_ORIGIN=https://YOUR_DOMAIN
```

Safety nets: compose refuses to start when `POSTGRES_*`, `JWT_SECRET` or
`CORS_ORIGIN` is missing; the API refuses to start on a placeholder or weak
`JWT_SECRET`, a placeholder database password, `COOKIE_SECURE` not `true`, a
wildcard / placeholder `CORS_ORIGIN`. `TRUST_PROXY` and `UPLOAD_DIR` are set
by the compose file. Uploads live **outside** the code folder and are mounted
only into the backend container, so releases never touch them and Nginx can
never serve them.

## 3. First release: build, database, migrate, start

```bash
C=/opt/skytop/app/deploy/scripts/compose.sh
$C config --quiet && echo config ok             # compose file + env file valid
/opt/skytop/app/deploy/scripts/release.sh       # same script as every later update (section 9)
```

On the first run `release.sh` skips the backup (no database yet), builds the
three images tagged with the commit (and `current`), starts PostgreSQL and
waits until it is healthy, runs the one-shot `migrate` container, then starts
the backend and the frontend and waits for both health checks.

**Migrations** run only in the `migrate` container (profile `ops`, never
started by `up`), always with `prisma migrate deploy`: it applies the committed
migrations that are pending and nothing else. The API container does not
migrate on boot. By hand: `$C run --rm migrate`. Never run `prisma migrate
reset`, `prisma db push` or the demo seed against production.

## 4. First manager

```bash
read -rp  'Manager username (≥ 6: letters, digits . _ -): ' SEED_MANAGER_USERNAME
read -rsp 'Manager password (≥ 10, upper + lower + digit + symbol): ' SEED_MANAGER_PASSWORD; echo
export SEED_MANAGER_USERNAME SEED_MANAGER_PASSWORD
$C run --rm -e SEED_MANAGER_USERNAME -e SEED_MANAGER_PASSWORD backend node dist/prisma/seed.js
unset SEED_MANAGER_USERNAME SEED_MANAGER_PASSWORD
```

`-e NAME` (no value) passes the variable from your shell, so the password is
not in the shell history or the compose file. The seed refuses missing or
`CHANGE_ME` values and any username / password that breaks the policy, and it
never changes an existing account's password. Employees are then created from
the Users page (they must change their password on first login). The demo
dataset refuses to run in production (`NODE_ENV=production` inside the image).

## 5. Check the containers

```bash
$C ps                                                  # postgres, backend, frontend: healthy
/opt/skytop/app/deploy/scripts/healthcheck.sh          # healthy: {"status":"ok","database":"ok",…}
curl -s http://127.0.0.1:8083/healthz                  # ok
```

Health checks: backend → `GET /api/v1/health` (API + database, 503 while the
database is unreachable or the API is stopping; `/api/v1/health/live` = process
only); frontend → `/healthz`; postgres → `pg_isready`. `restart:
unless-stopped` brings every container back after a crash or a reboot. On
`stop` / restart the API gets SIGTERM, finishes in-flight requests, disconnects
from PostgreSQL and exits (forced after 10 s; compose waits 20 s); PostgreSQL
gets 60 s for a clean shutdown.

## 6. Host Nginx + HTTPS (Let's Encrypt)

DNS first: an `A` record (and `AAAA` for IPv6) for `YOUR_DOMAIN` → the VPS.

```bash
rm -f /etc/nginx/sites-enabled/default

# 6a. HTTP only, to answer the ACME challenge.
sed 's/YOUR_DOMAIN/app.example.com/g' /opt/skytop/app/deploy/nginx/skytop-bootstrap.conf > /etc/nginx/sites-available/skytop
ln -sf /etc/nginx/sites-available/skytop /etc/nginx/sites-enabled/skytop
nginx -t && systemctl reload nginx

# 6b. First certificate (webroot: Nginx keeps running).
certbot certonly --webroot -w /var/www/certbot -d app.example.com \
  --email YOUR_EMAIL --agree-tos --no-eff-email

# 6c. The real site (HTTPS + proxy to the containers).
sed 's/YOUR_DOMAIN/app.example.com/g' /opt/skytop/app/deploy/nginx/skytop.conf > /etc/nginx/sites-available/skytop
nginx -t && systemctl reload nginx

# 6d. Renewal: certbot.timer renews automatically; reload Nginx afterwards.
printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
certbot renew --dry-run
```

Certbot stays on the host (no container): it needs the host's port 80 and
Nginx, and `certbot.timer` + the reload hook already do renewals.

What the host site does: HTTP → HTTPS (except ACME); TLS 1.2 / 1.3; HSTS on
every response; `/api/` → backend with `X-Forwarded-For` **overwritten** by
`$remote_addr`, `X-Request-Id: $request_id`, 20 MB request bodies (pilgrim
passport + photo), 120 s timeouts for PDF / Excel reports, gzip for JSON;
`/` → frontend container, which sets the Content-Security-Policy (no inline
scripts), `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
`Permissions-Policy`, caches `/assets/*` for a year (hashed names), never
caches `index.html`, and falls back to `index.html` for app routes; dotfiles
are denied. No WebSocket headers: the app does not use WebSockets.

**Client IPs.** The host Nginx reaches the backend through the published
loopback port, i.e. from the Docker network's gateway (`SKYTOP_GATEWAY`,
default `172.30.80.1`). The API trusts `X-Forwarded-For` only from loopback and
that gateway, so it logs and rate-limits by the real client IP and nobody can
spoof it. Check once after go-live: `$C logs backend | tail` must show your
public IP in `"ip"`, not `172.30.80.1`.

## 7. Backups

```bash
cp /opt/skytop/app/deploy/cron/skytop-backup /etc/cron.d/skytop-backup
chmod 644 /etc/cron.d/skytop-backup
/opt/skytop/app/deploy/scripts/backup.sh               # first run now
ls -l /var/backups/skytop/daily/
```

Every night at 02:30: `pg_dump` inside the postgres container (custom format,
read back with `pg_restore --list`), `tar.gz` of `/var/lib/skytop/uploads`
(verified) and `SHA256SUMS`, in `/var/backups/skytop/daily/skytop-YYYYmmdd-HHMMSS/`.
Keeps **7 daily** and **4 weekly** (Sunday) copies (`KEEP_DAILY`,
`KEEP_WEEKLY`, `BACKUP_DIR` to change). No password is needed: `pg_dump` runs
in the container over its local socket. It fails (non-zero exit, nothing kept)
if the database container is not running or any step fails;
`/var/log/skytop-backup.log` has the history.

Keep a copy of `/etc/skytop/docker.env` in your password manager — it is not
in the backups (secrets).

**Off-site copy (strongly recommended):** a backup on the same disk does not
survive losing the VPS. Copy `/var/backups/skytop` daily to another place
(`rsync` to another server, or object storage via `rclone`) and enable
Hostinger's VPS snapshots as an extra layer.

## 8. Restore (rehearse it before you need it)

`restore.sh` never overwrites live data: it verifies the checksums, restores
into a **new** database in the running postgres container and a **new**
uploads folder, then prints the switch commands.

```bash
B=/var/backups/skytop/daily/skytop-20261019-023000                   # pick a backup
/opt/skytop/app/deploy/scripts/restore.sh "$B" skytop_restored /var/lib/skytop/uploads-restored
```

Switch the application to the restored copy:

```bash
$C stop backend                                                      # 1. stop writes
nano /etc/skytop/docker.env    # POSTGRES_DB=skytop_restored  UPLOADS_DIR=/var/lib/skytop/uploads-restored   (2 + 3)
$C run --rm migrate                                                  # 4. prisma migrate deploy
$C up -d --wait                                                      # 5. restart (postgres is recreated with the new name; data stays in the volume)
/opt/skytop/app/deploy/scripts/healthcheck.sh                        # 6. health
```

7. Smoke test in the browser: log in (manager and employee), open a pilgrim
file and its passport image, a payment receipt scan, حسابات المناديب and an
account statement PDF. The old database and folder stay untouched until you
remove them (`$C exec postgres dropdb -U skytop skytop`, `rm -rf
/var/lib/skytop/uploads`) — or switch back by restoring the two lines.

Restoring onto a **new server**: do steps 1–3 there (empty `pgdata`), copy the
backup folder over, run `restore.sh` and the switch above.

## 9. Releasing updates

```bash
cd /opt/skytop/app && git pull --ff-only
/opt/skytop/app/deploy/scripts/release.sh
```

`release.sh`: backup → build images tagged with the commit (the old containers
keep serving meanwhile) → postgres healthy → `migrate` (`prisma migrate
deploy`) → recreate **backend** (waits until healthy) → recreate **frontend** →
health check → keep the last 5 image sets. If a step fails, it stops and the
previous version keeps running. Downtime is the backend restart only (≈ 5–10 s
in the local rehearsal; Nginx answers 502 meanwhile and the browser shows a
connection error for requests in that window): release outside office hours.

Migrations run while the old version is still serving, so they must be
backward compatible (add tables / columns / enum values first; remove things
only in a later release). For a migration that is not, stop the backend first
(`$C stop backend`), then run `release.sh`.

## 10. Rollback

```bash
/opt/skytop/app/deploy/scripts/rollback.sh             # lists the image tags kept
/opt/skytop/app/deploy/scripts/rollback.sh 1a2b3c4d5e6f
```

Rolling back the **application** is quick: the images of the last 5 releases
stay on the server, and `rollback.sh` re-tags one as `current` and recreates
backend + frontend. The **database is not rolled back**: migrations are
forward-only. That is fine when the newer migrations were additive (old code
ignores new columns / tables). If a newer migration removed or changed
something the old code needs, restore the backup that `release.sh` took just
before that release (section 8). If the image is gone,
`git checkout <commit>`, `SKYTOP_TAG=<commit> $C build backend frontend`,
`rollback.sh <commit>`, then `git checkout main`.

## 11. Verify production

```bash
/opt/skytop/app/deploy/scripts/healthcheck.sh https://YOUR_DOMAIN
curl -sI https://YOUR_DOMAIN | grep -iE 'strict-transport|content-security|x-frame'
curl -sI https://YOUR_DOMAIN/api/v1/health | grep -iE 'x-request-id|x-powered-by'   # request id yes, powered-by no
curl -s -o /dev/null -w '%{http_code}\n' https://YOUR_DOMAIN/.env                   # 403
ss -ltnp | grep -E ':(4000|8083|5432)\b'      # only 127.0.0.1:4000 / 127.0.0.1:8083, no 5432
$C ps                                          # all healthy
$C logs --since 10m backend | tail
```

Then in the browser (as the manager, then as an employee): log in → dashboard →
add a delegate and a trip → add a pilgrim with a passport image → open the
passport image → record a payment with a receipt scan → account statement PDF →
Excel export → audit log shows the actions.

## Operations notes

* **Logs:** `$C logs -f backend` — one JSON line per request (`requestId`,
  method, path without query string, status, duration, user id, client IP).
  Passwords, tokens, cookies, secrets and file contents are never logged.
  Docker rotates each container's log at 10 MB, keeping 5 files.
* **Containers:** none is privileged; all run with `no-new-privileges`; the
  backend (uid 10001), the migration job and the web server (uid 101) also run
  with a read-only root filesystem and no Linux capabilities. Images contain no
  secrets (`.dockerignore` excludes `.env`, uploads, tests).
* **Rate limits** are in memory (one API container; reset on restart). Per
  client IP — an office behind one router shares one IP, which
  `RATE_LIMIT_MAX=1200`/min accounts for. Login: 10/min per IP, and an account
  is locked for 15 min after `LOGIN_FAILURES_PER_ACCOUNT` (10) wrong passwords.
* **Sessions:** 12 h cookies (`HttpOnly`, `Secure`, `SameSite=Lax`). Changing a
  password, a manager reset and deactivating an account end that user's other
  sessions. Changing `JWT_SECRET` (then `$C up -d backend`) signs everyone out.
* **Legacy usernames** shorter than 6 characters keep working; list them with
  `$C exec postgres psql -U skytop -d skytop -c 'SELECT username FROM "User" WHERE length(username) < 6'`
  and rename them from the Users page if desired.
* **Database shell:** `$C exec postgres psql -U skytop -d skytop` (read-only
  queries only, unless you know exactly why).
* **Base image updates:** `release.sh` builds with `--pull`, so each release
  picks up patched Node / Nginx images; PostgreSQL follows the `17` tag on
  `$C pull postgres && $C up -d postgres` (minor versions only — a major
  upgrade needs dump / restore).
* **Never** run `prisma migrate reset`, `prisma db push` or the demo seed on production.
