#!/usr/bin/env bash
# Sky Top backup (Docker): PostgreSQL dump taken inside the postgres
# container + the private uploads folder on the host.
#
#   sudo /opt/skytop/app/deploy/scripts/backup.sh
#
# Settings (environment, all optional):
#   SKYTOP_ENV_FILE   compose env file (default /etc/skytop/docker.env)
#   SKYTOP_PROJECT    compose project (default skytop)
#   BACKUP_DIR        destination (default /var/backups/skytop)
#   KEEP_DAILY        daily backups kept (default 7)
#   KEEP_WEEKLY       weekly backups kept (default 4; taken on Sundays)
#
# Each run writes BACKUP_DIR/daily/skytop-YYYYmmdd-HHMMSS/ containing db.dump
# (pg_dump custom format), uploads.tar.gz and SHA256SUMS, verified before it
# is kept. No password is needed or stored: pg_dump runs in the container
# over its local socket. Host PostgreSQL tools are not required.
set -Eeuo pipefail
umask 077

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SKYTOP_ENV_FILE:-/etc/skytop/docker.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/skytop}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
export SKYTOP_ENV_FILE="$ENV_FILE"

log() { printf '%s backup: %s\n' "$(date -Iseconds)" "$*"; }
fail() { log "FAILED: $*"; exit 1; }
trap 'fail "line $LINENO: $BASH_COMMAND"' ERR
compose() { "$SCRIPTS/compose.sh" "$@"; }
# Runs a shell command in the postgres container (its POSTGRES_* variables
# are expanded there, not here).
in_db() { compose exec -T postgres sh -c "$1"; }

[[ -r "$ENV_FILE" ]] || fail "cannot read $ENV_FILE"
UPLOADS_DIR="$(grep -E '^UPLOADS_DIR=' "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
UPLOADS_DIR="${UPLOADS_DIR:-/var/lib/skytop/uploads}"
[[ -d "$UPLOADS_DIR" ]] || fail "UPLOADS_DIR '$UPLOADS_DIR' is not a directory"
[[ -n "$(compose ps --status running -q postgres)" ]] || fail "the postgres container is not running"

stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
work="$(mktemp -d "$BACKUP_DIR/.incomplete-$stamp.XXXX")"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT

log "dumping database"
in_db 'pg_dump --format=custom --compress=6 --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$work/db.dump"
# Verify the dump (read back through pg_restore in the container).
in_db 'pg_restore --list' < "$work/db.dump" > /dev/null || fail "database dump is not readable"
[[ -s "$work/db.dump" ]] || fail "database dump is empty"

log "archiving uploads from $UPLOADS_DIR"
tar -C "$(dirname "$UPLOADS_DIR")" -czf "$work/uploads.tar.gz" "$(basename "$UPLOADS_DIR")"
tar -tzf "$work/uploads.tar.gz" > /dev/null || fail "uploads archive is not readable"

( cd "$work" && { sha256sum db.dump uploads.tar.gz 2>/dev/null || shasum -a 256 db.dump uploads.tar.gz; } > SHA256SUMS )

final="$BACKUP_DIR/daily/skytop-$stamp"
mv "$work" "$final"
trap - EXIT
log "saved $final ($(du -sh "$final" | cut -f1))"

# Weekly copy (hard links: no extra space) every Sunday.
if [[ "$(date +%u)" == "7" ]]; then
  cp -al "$final" "$BACKUP_DIR/weekly/"
  log "weekly copy kept"
fi

prune() { # keep the newest $2 entries in $1
  local dir="$1" keep="$2"
  find "$dir" -mindepth 1 -maxdepth 1 -type d -name 'skytop-*' | sort -r | tail -n +"$((keep + 1))" | while read -r old; do
    rm -rf -- "$old"
    log "pruned $old"
  done
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"
log "done"
