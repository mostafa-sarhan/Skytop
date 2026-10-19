#!/usr/bin/env bash
# Sky Top backup: PostgreSQL (custom-format dump) + private uploads (tar.gz).
#
#   sudo /opt/skytop/app/deploy/native/scripts/backup.sh
#
# Settings (environment, all optional):
#   SKYTOP_ENV_FILE   env file with DATABASE_URL and UPLOAD_DIR (default /etc/skytop/server.env)
#   BACKUP_DIR        destination (default /var/backups/skytop)
#   KEEP_DAILY        daily backups kept (default 7)
#   KEEP_WEEKLY       weekly backups kept (default 4; taken on Sundays)
#
# Each run writes BACKUP_DIR/daily/skytop-YYYYmmdd-HHMMSS/ containing db.dump,
# uploads.tar.gz and SHA256SUMS, verified before it is kept. No password is
# stored in this script: the connection comes from the env file (root-only).
set -Eeuo pipefail
umask 077

ENV_FILE="${SKYTOP_ENV_FILE:-/etc/skytop/server.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/skytop}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"

log() { printf '%s backup: %s\n' "$(date -Iseconds)" "$*"; }
fail() { log "FAILED: $*"; exit 1; }
trap 'fail "line $LINENO: $BASH_COMMAND"' ERR

[[ -r "$ENV_FILE" ]] || fail "cannot read $ENV_FILE"
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
UPLOAD_DIR="$(grep -E '^UPLOAD_DIR=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
[[ -n "$DATABASE_URL" ]] || fail "DATABASE_URL missing in $ENV_FILE"
[[ -d "$UPLOAD_DIR" ]] || fail "UPLOAD_DIR '$UPLOAD_DIR' is not a directory"
# pg_dump does not accept Prisma-only URL parameters such as ?schema=public.
PG_URL="${DATABASE_URL%%\?*}"

stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
work="$(mktemp -d "$BACKUP_DIR/.incomplete-$stamp.XXXX")"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT

log "dumping database"
pg_dump --format=custom --compress=6 --no-owner --no-privileges --file "$work/db.dump" "$PG_URL"
pg_restore --list "$work/db.dump" > /dev/null || fail "database dump is not readable"

log "archiving uploads from $UPLOAD_DIR"
tar -C "$(dirname "$UPLOAD_DIR")" -czf "$work/uploads.tar.gz" "$(basename "$UPLOAD_DIR")"
tar -tzf "$work/uploads.tar.gz" > /dev/null || fail "uploads archive is not readable"

( cd "$work" && sha256sum db.dump uploads.tar.gz > SHA256SUMS 2>/dev/null || shasum -a 256 db.dump uploads.tar.gz > SHA256SUMS )

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
