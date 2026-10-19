#!/usr/bin/env bash
# Waits for the API to report ready (database reachable) and prints the result.
#
#   deploy/scripts/healthcheck.sh                       # http://127.0.0.1:4000 (backend port)
#   deploy/scripts/healthcheck.sh https://YOUR_DOMAIN   # through Nginx + HTTPS
set -Euo pipefail
BASE="${1:-http://127.0.0.1:4000}"
URL="${BASE%/}/api/v1/health"
for _ in $(seq 1 30); do
  body="$(curl -fsS --max-time 5 "$URL" 2>/dev/null)" && { echo "healthy: $body"; exit 0; }
  sleep 2
done
echo "UNHEALTHY: $URL did not answer 200 within 60 s" >&2
curl -sS --max-time 5 "$URL" >&2 || true
exit 1
