#!/usr/bin/env bash
# Sky Top restore (Docker) — into a NEW database (in the running postgres
# container) and a NEW uploads folder on the host, never over live data.
# Switching the app to the restored copy is a separate, deliberate step
# (deploy/README.md → Restore): it prints the commands at the end.
#
#   sudo /opt/skytop/app/deploy/scripts/restore.sh BACKUP_PATH TARGET_DB TARGET_UPLOADS_DIR
#
#   BACKUP_PATH         a backup folder (…/daily/skytop-YYYYmmdd-HHMMSS)
#   TARGET_DB           new database name, must not exist (e.g. skytop_restore_20261019)
#   TARGET_UPLOADS_DIR  new folder, must not exist (e.g. /var/lib/skytop/uploads-restore-20261019)
#
# Settings (environment): SKYTOP_ENV_FILE, SKYTOP_PROJECT (see compose.sh),
#   UPLOADS_OWNER  owner of the restored files (default 10001:10001 = the
#                  backend container user; "" to skip chown)
set -Eeuo pipefail
umask 077

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log() { printf '%s restore: %s\n' "$(date -Iseconds)" "$*"; }
fail() { log "FAILED: $*"; exit 1; }
compose() { "$SCRIPTS/compose.sh" "$@"; }
# Runs a shell command in the postgres container; extra arguments become $1…
in_db() { local cmd="$1"; shift; compose exec -T postgres sh -c "$cmd" sh "$@"; }

[[ $# -eq 3 ]] || fail "usage: restore.sh BACKUP_PATH TARGET_DB TARGET_UPLOADS_DIR"
BACKUP="$1"; TARGET_DB="$2"; TARGET_UPLOADS="$3"
UPLOADS_OWNER="${UPLOADS_OWNER-10001:10001}"

[[ "$TARGET_DB" =~ ^[a-z0-9_]+$ ]] || fail "target database name must be lowercase letters, digits and _"
[[ -f "$BACKUP/db.dump" && -f "$BACKUP/uploads.tar.gz" && -f "$BACKUP/SHA256SUMS" ]] || fail "$BACKUP is not a Sky Top backup"
[[ ! -e "$TARGET_UPLOADS" ]] || fail "$TARGET_UPLOADS already exists (choose a new folder)"
[[ -n "$(compose ps --status running -q postgres)" ]] || fail "the postgres container is not running (start it: compose.sh up -d postgres)"

log "verifying checksums"
( cd "$BACKUP" && { sha256sum -c SHA256SUMS 2>/dev/null || shasum -a 256 -c SHA256SUMS; } ) > /dev/null || fail "checksum mismatch"

exists="$(in_db 'psql -XAt -U "$POSTGRES_USER" -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '"'"'$1'"'"'"' "$TARGET_DB")"
[[ -z "$exists" ]] || fail "database $TARGET_DB already exists (choose a new name)"

log "creating database $TARGET_DB"
in_db 'createdb -U "$POSTGRES_USER" "$1"' "$TARGET_DB"
log "restoring database"
in_db 'pg_restore --no-owner --no-privileges --exit-on-error -U "$POSTGRES_USER" -d "$1"' "$TARGET_DB" < "$BACKUP/db.dump"

log "restoring uploads into $TARGET_UPLOADS"
mkdir -p "$TARGET_UPLOADS"
tar -xzf "$BACKUP/uploads.tar.gz" -C "$TARGET_UPLOADS" --strip-components=1
[[ -z "$UPLOADS_OWNER" ]] || chown -R "$UPLOADS_OWNER" "$TARGET_UPLOADS"
chmod 700 "$TARGET_UPLOADS"

tables="$(in_db 'psql -XAt -U "$POSTGRES_USER" -d "$1" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = '"'"'public'"'"'"' "$TARGET_DB")"
files="$(find "$TARGET_UPLOADS" -type f | wc -l | tr -d ' ')"
log "done: $tables tables in $TARGET_DB, $files files in $TARGET_UPLOADS"
cat <<NEXT
Next (switch the app to the restored copy — deploy/README.md → Restore):
  1. $SCRIPTS/compose.sh stop backend
  2. edit ${SKYTOP_ENV_FILE:-/etc/skytop/docker.env}: POSTGRES_DB=$TARGET_DB  UPLOADS_DIR=$TARGET_UPLOADS
  3. $SCRIPTS/compose.sh run --rm migrate
  4. $SCRIPTS/compose.sh up -d --wait
  5. $SCRIPTS/healthcheck.sh && smoke test (README → Verify)
NEXT
