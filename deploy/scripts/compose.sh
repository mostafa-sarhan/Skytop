#!/usr/bin/env bash
# docker compose for the Sky Top production stack, with the right compose
# file, env file and project name. Any compose arguments are passed through:
#
#   sudo /opt/skytop/app/deploy/scripts/compose.sh ps
#   sudo /opt/skytop/app/deploy/scripts/compose.sh logs -f backend
#   sudo /opt/skytop/app/deploy/scripts/compose.sh run --rm migrate
#
# Settings (environment):
#   SKYTOP_ENV_FILE   default /etc/skytop/docker.env
#   SKYTOP_PROJECT    compose project name (default skytop; volumes are <project>_pgdata)
#   SKYTOP_TAG        image tag to run (default "current", set by release.sh)
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${SKYTOP_ENV_FILE:-/etc/skytop/docker.env}"
PROJECT="${SKYTOP_PROJECT:-skytop}"

[[ -r "$ENV_FILE" ]] || { echo "compose.sh: cannot read $ENV_FILE" >&2; exit 1; }
exec docker compose --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.prod.yml" \
  --env-file "$ENV_FILE" -p "$PROJECT" "$@"
