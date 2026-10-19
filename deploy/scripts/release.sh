#!/usr/bin/env bash
# Build and roll out the code currently checked out in the repository
# (after `git pull --ff-only`):
#
#   sudo /opt/skytop/app/deploy/scripts/release.sh
#
# Order: backup → build images tagged with the commit → postgres healthy →
# `prisma migrate deploy` (one-shot container; never reset) → backend →
# frontend → health check. The running containers keep serving until the new
# images are built and migrated; if any step fails the old version stays up.
# The new images are also tagged "current" (what compose runs by default);
# older commit tags are kept for rollback.sh (the newest KEEP_IMAGES).
#
# Settings (environment): SKYTOP_ENV_FILE, SKYTOP_PROJECT (see compose.sh),
#   SKIP_BACKUP=1   skip the pre-release backup (not recommended)
#   KEEP_IMAGES     commit-tagged images kept per service (default 5)
#   RELEASE_LOG     history of released tags (default /var/lib/skytop/releases.log)
set -Eeuo pipefail

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPTS/../.." && pwd)"
ENV_FILE="${SKYTOP_ENV_FILE:-/etc/skytop/docker.env}"
KEEP_IMAGES="${KEEP_IMAGES:-5}"
RELEASE_LOG="${RELEASE_LOG:-/var/lib/skytop/releases.log}"
export SKYTOP_ENV_FILE="$ENV_FILE"

log() { printf '%s release: %s\n' "$(date -Iseconds)" "$*"; }
fail() { log "FAILED: $*"; exit 1; }
trap 'fail "line $LINENO: $BASH_COMMAND (the previous version is still running)"' ERR
compose() { "$SCRIPTS/compose.sh" "$@"; }

[[ -r "$ENV_FILE" ]] || fail "cannot read $ENV_FILE"
[[ -z "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ]] || fail "uncommitted changes in $APP_DIR"
TAG="$(git -C "$APP_DIR" rev-parse --short=12 HEAD)"
log "code: $(git -C "$APP_DIR" log -1 --format='%h %s')"

if [[ "${SKIP_BACKUP:-0}" != "1" && -n "$(compose ps --status running -q postgres)" ]]; then
  log "backup before release"
  "$SCRIPTS/backup.sh"
fi

log "building images $TAG"
SKYTOP_TAG="$TAG" compose build --pull backend frontend migrate

log "database: waiting for postgres"
compose up -d --wait postgres
log "database: prisma migrate deploy"
SKYTOP_TAG="$TAG" compose run --rm migrate

for image in skytop-backend skytop-frontend skytop-migrate; do
  docker tag "$image:$TAG" "$image:current"
done

log "starting backend"
compose up -d --wait --no-deps backend
log "starting frontend"
compose up -d --wait --no-deps frontend

BACKEND_PORT="$(grep -E '^BACKEND_PORT=' "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
"$SCRIPTS/healthcheck.sh" "http://127.0.0.1:${BACKEND_PORT:-4000}"

mkdir -p "$(dirname "$RELEASE_LOG")"
printf '%s %s\n' "$(date -Iseconds)" "$TAG" >> "$RELEASE_LOG"

# Keep the newest KEEP_IMAGES commit tags per image (plus "current").
for image in skytop-backend skytop-frontend skytop-migrate; do
  docker image ls "$image" --format '{{.Tag}}' | { grep -vx -e current -e "$TAG" || true; } | tail -n +"$KEEP_IMAGES" \
    | while read -r old; do docker image rm "$image:$old" > /dev/null && log "removed old image $image:$old"; done
done
docker image prune -f > /dev/null
log "release $TAG complete"
