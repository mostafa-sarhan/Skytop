#!/usr/bin/env bash
# Sky Top restore — into a NEW database and a NEW uploads folder (never over
# live data). Switching the running app to the restored copy is a separate,
# deliberate step (see deploy/native/README.md, "Restore").
#
#   sudo deploy/native/scripts/restore.sh BACKUP_PATH TARGET_DB TARGET_UPLOADS_DIR
#
#   BACKUP_PATH         a backup folder (…/daily/skytop-YYYYmmdd-HHMMSS)
#   TARGET_DB           new database name, must not exist (e.g. skytop_restore_20261019)
#   TARGET_UPLOADS_DIR  new folder, must not exist (e.g. /var/lib/skytop/uploads-restore)
#
# Settings (environment):
#   DB_OWNER       role that will own the restored objects (default skytop)
#   PG_ADMIN       command prefix to run PostgreSQL admin tools (default "sudo -u postgres")
#   UPLOADS_OWNER  owner of the restored files (default skytop:skytop; "" to skip chown)
set -Eeuo pipefail
umask 077

log() { printf '%s restore: %s\n' "$(date -Iseconds)" "$*"; }
fail() { log "FAILED: $*"; exit 1; }

[[ $# -eq 3 ]] || fail "usage: restore.sh BACKUP_PATH TARGET_DB TARGET_UPLOADS_DIR"
BACKUP="$1"; TARGET_DB="$2"; TARGET_UPLOADS="$3"
DB_OWNER="${DB_OWNER:-skytop}"
read -r -a ADMIN <<< "${PG_ADMIN-sudo -u postgres}"
# Runs a PostgreSQL client tool through the admin prefix (may be empty).
admin() { ${ADMIN[@]+"${ADMIN[@]}"} "$@"; }
UPLOADS_OWNER="${UPLOADS_OWNER-skytop:skytop}"

[[ "$TARGET_DB" =~ ^[a-z0-9_]+$ ]] || fail "target database name must be lowercase letters, digits and _"
[[ -f "$BACKUP/db.dump" && -f "$BACKUP/uploads.tar.gz" && -f "$BACKUP/SHA256SUMS" ]] || fail "$BACKUP is not a Sky Top backup"
[[ ! -e "$TARGET_UPLOADS" ]] || fail "$TARGET_UPLOADS already exists (choose a new folder)"

log "verifying checksums"
( cd "$BACKUP" && { sha256sum -c SHA256SUMS 2>/dev/null || shasum -a 256 -c SHA256SUMS; } ) > /dev/null || fail "checksum mismatch"

exists="$(admin psql -XAtc "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB'" postgres)"
[[ -z "$exists" ]] || fail "database $TARGET_DB already exists (choose a new name)"

log "creating database $TARGET_DB (owner $DB_OWNER)"
admin psql -X -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$TARGET_DB\" OWNER \"$DB_OWNER\"" postgres > /dev/null
log "restoring database"
admin pg_restore --no-owner --no-privileges --role="$DB_OWNER" --exit-on-error --dbname "$TARGET_DB" "$BACKUP/db.dump"

log "restoring uploads into $TARGET_UPLOADS"
mkdir -p "$TARGET_UPLOADS"
tar -xzf "$BACKUP/uploads.tar.gz" -C "$TARGET_UPLOADS" --strip-components=1
[[ -z "$UPLOADS_OWNER" ]] || chown -R "$UPLOADS_OWNER" "$TARGET_UPLOADS"
chmod 700 "$TARGET_UPLOADS"

tables="$(admin psql -XAtc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'" "$TARGET_DB")"
files="$(find "$TARGET_UPLOADS" -type f | wc -l | tr -d ' ')"
log "done: $tables tables in $TARGET_DB, $files files in $TARGET_UPLOADS"
log "next: run migrations against $TARGET_DB, then point DATABASE_URL / UPLOAD_DIR at the restored copy (README → Restore)"
