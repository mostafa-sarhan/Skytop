#!/usr/bin/env bash
# Roll the application containers back to an earlier release:
#
#   sudo /opt/skytop/app/deploy/scripts/rollback.sh            # list available tags
#   sudo /opt/skytop/app/deploy/scripts/rollback.sh TAG        # run images TAG
#
# Only the backend and frontend images change. The DATABASE IS NOT ROLLED
# BACK: migrations applied by a newer release stay. This is safe when those
# migrations were additive (new tables / columns / enum values — the usual
# case); if a newer migration removed or changed something the old code
# needs, restore the pre-release backup instead (README → Rollback).
#
# Settings (environment): SKYTOP_ENV_FILE, SKYTOP_PROJECT (see compose.sh),
#   RELEASE_LOG (default /var/lib/skytop/releases.log).
set -Eeuo pipefail

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SKYTOP_ENV_FILE:-/etc/skytop/docker.env}"
RELEASE_LOG="${RELEASE_LOG:-/var/lib/skytop/releases.log}"
export SKYTOP_ENV_FILE="$ENV_FILE"
log() { printf '%s rollback: %s\n' "$(date -Iseconds)" "$*"; }
fail() { log "FAILED: $*"; exit 1; }
compose() { "$SCRIPTS/compose.sh" "$@"; }

if [[ $# -eq 0 ]]; then
  echo "Images available for rollback (newest first):"
  docker image ls skytop-backend --format '  {{.Tag}}  {{.CreatedSince}}' | { grep -v '^ *current ' || true; }
  echo "Released (oldest first): $(tail -n 5 "$RELEASE_LOG" 2>/dev/null | awk '{print $2}' | tr '\n' ' ')"
  exit 0
fi
TAG="$1"
for image in skytop-backend skytop-frontend; do
  docker image inspect "$image:$TAG" > /dev/null 2>&1 \
    || fail "$image:$TAG not found. Rebuild it: git checkout $TAG && SKYTOP_TAG=$TAG $SCRIPTS/compose.sh build backend frontend (then git checkout main)"
done

log "switching backend + frontend to $TAG (database unchanged)"
for image in skytop-backend skytop-frontend; do docker tag "$image:$TAG" "$image:current"; done
compose up -d --wait --no-deps backend frontend
BACKEND_PORT="$(grep -E '^BACKEND_PORT=' "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
"$SCRIPTS/healthcheck.sh" "http://127.0.0.1:${BACKEND_PORT:-4000}"
log "now running $TAG. The repository checkout is unchanged: the next release.sh builds whatever is checked out."
