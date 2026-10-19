#!/usr/bin/env bash
# Build and (re)start Sky Top from the code currently checked out in APP_DIR.
#
#   sudo /opt/skytop/app/deploy/scripts/release.sh
#
# Steps: backup → server install/build → `prisma migrate deploy` (never
# reset) → client build into a new folder, swapped in atomically → restart
# the API → wait for /api/v1/health. Builds run as the skytop user.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/skytop/app}"
ENV_FILE="${SKYTOP_ENV_FILE:-/etc/skytop/server.env}"
SERVICE="${SERVICE:-skytop-api}"
RUN_AS="${RUN_AS:-skytop}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"

log() { printf '%s release: %s\n' "$(date -Iseconds)" "$*"; }
fail() { log "FAILED: $*"; exit 1; }
trap 'fail "line $LINENO: $BASH_COMMAND"' ERR
as_app() { runuser -u "$RUN_AS" -- "$@"; }

[[ -r "$ENV_FILE" ]] || fail "cannot read $ENV_FILE"
cd "$APP_DIR"
log "code: $(as_app git -C "$APP_DIR" log -1 --format='%h %s')"

if [[ "$SKIP_BACKUP" != "1" ]]; then
  log "backup before release"
  "$APP_DIR/deploy/scripts/backup.sh"
fi

log "server: install + build"
as_app bash -c "cd '$APP_DIR/server' && npm ci --no-audit --no-fund && npx prisma generate && npm run build"

log "database: prisma migrate deploy"
as_app bash -c "set -a && . '$ENV_FILE' && set +a && cd '$APP_DIR/server' && npx prisma migrate deploy"

log "client: install + build"
as_app bash -c "cd '$APP_DIR/client' && npm ci --no-audit --no-fund && npx tsc -b && npx vite build --outDir dist-next --emptyOutDir"
# Swap the new build in at once (Nginx serves client/dist).
rm -rf "$APP_DIR/client/dist-prev"
[[ -d "$APP_DIR/client/dist" ]] && mv "$APP_DIR/client/dist" "$APP_DIR/client/dist-prev"
mv "$APP_DIR/client/dist-next" "$APP_DIR/client/dist"

log "restarting $SERVICE"
systemctl restart "$SERVICE"
"$APP_DIR/deploy/scripts/healthcheck.sh" "http://127.0.0.1:$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2 || echo 4000)"
log "release complete"
