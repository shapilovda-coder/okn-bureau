#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SSH_HOST="${OKN_SSH_HOST:-okn-vps}"
STAMP="${1:-$(date +%Y%m%d-%H%M%S)}"
REMOTE_ROOT="/var/www/oknproekt/current"
REMOTE_STAGE="/tmp/oknproekt-production-backup-$STAMP"
LOCAL_STAGE="$PROJECT_DIR/backups/production-$STAMP"

mkdir -p "$LOCAL_STAGE"

ssh "$SSH_HOST" "STAMP='$STAMP' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail

REMOTE_ROOT="/var/www/oknproekt/current"
REMOTE_STAGE="/tmp/oknproekt-production-backup-$STAMP"

mkdir -p "$REMOTE_STAGE"

tar -C "$REMOTE_ROOT" \
  --exclude='./backup-*' \
  --exclude='./.git' \
  --exclude='./._*' \
  --exclude='*.bak*' \
  --exclude='*.rollback-*' \
  -czf "$REMOTE_STAGE/site.tar.gz" .

tar -C / -czf "$REMOTE_STAGE/server-config.tar.gz" \
  etc/nginx/sites-available/oknproekt.ru \
  etc/systemd/system/oknproekt.service

sed -E 's/=.*$/=REDACTED/' /etc/oknproekt/oknproekt.env \
  > "$REMOTE_STAGE/oknproekt.env.template"

tar -tzf "$REMOTE_STAGE/site.tar.gz" | sort \
  > "$REMOTE_STAGE/site-file-list.txt"

(
  cd "$REMOTE_STAGE"
  sha256sum site.tar.gz server-config.tar.gz oknproekt.env.template \
    > SHA256SUMS
)
REMOTE_SCRIPT

scp -r "$SSH_HOST:$REMOTE_STAGE/." "$LOCAL_STAGE/"

(
  cd "$LOCAL_STAGE"
  shasum -a 256 -c SHA256SUMS
  tar -tzf site.tar.gz >/dev/null
  tar -tzf server-config.tar.gz >/dev/null
)

ssh "$SSH_HOST" "find '$REMOTE_STAGE' -type f -delete"
ssh "$SSH_HOST" "rmdir '$REMOTE_STAGE'"

printf 'Verified production backup: %s\n' "$LOCAL_STAGE"
