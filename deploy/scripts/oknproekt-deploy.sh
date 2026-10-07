#!/usr/bin/env bash

set -Eeuo pipefail
umask 022

SHA="${1:-}"
EXPECTED_SHA256="${2:-}"
BASE="/var/www/oknproekt"
CURRENT="$BASE/current"
ARCHIVE="/tmp/oknproekt-release-$SHA.tar.gz"
STAMP="$(date +%Y%m%d-%H%M%S)"
RELEASE="$BASE/releases/git-$SHA"
STAGE="$BASE/releases/.git-$SHA-$STAMP.tmp"
BACKUP="$BASE/backups/github-$STAMP-${SHA:0:12}"
PREVIOUS=""
PREVIOUS_WAS_DIRECTORY=0
SWITCHED=0

die() {
  printf 'ERROR: %s\n' "$*" >&2
  return 1
}

rollback() {
  local status=$?
  if [[ "$SWITCHED" -eq 1 && -n "$PREVIOUS" ]]; then
    if [[ "$PREVIOUS_WAS_DIRECTORY" -eq 1 ]]; then
      unlink "$CURRENT" 2>/dev/null || true
      mv "$PREVIOUS" "$CURRENT"
    else
      ln -s "$PREVIOUS" "$BASE/current.rollback"
      mv -Tf "$BASE/current.rollback" "$CURRENT"
    fi
    systemctl restart oknproekt.service || true
    printf 'ROLLBACK=PERFORMED\n' >&2
  fi
  exit "$status"
}

trap rollback ERR

[[ "$EUID" -eq 0 ]] || die "run through sudo"
[[ "${SUDO_USER:-}" == "okn-deploy" ]] || die "unexpected deploy user"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "invalid commit SHA"
[[ "$EXPECTED_SHA256" =~ ^[0-9a-f]{64}$ ]] || die "invalid archive checksum"
[[ -f "$ARCHIVE" ]] || die "release archive not found"

ACTUAL_SHA256="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
[[ "$ACTUAL_SHA256" == "$EXPECTED_SHA256" ]] || die "archive checksum mismatch"

if tar -tzf "$ARCHIVE" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  die "unsafe archive path"
fi

mkdir -p "$BASE/releases" "$BASE/backups" "$BACKUP"
tar -C "$CURRENT" -czf "$BACKUP/site.tar.gz" .
sha256sum "$BACKUP/site.tar.gz" > "$BACKUP/SHA256SUMS"
printf 'commit=%s\narchive_sha256=%s\ncreated=%s\n' "$SHA" "$EXPECTED_SHA256" "$STAMP" > "$BACKUP/MANIFEST.txt"

mkdir -p "$STAGE"
tar -xzf "$ARCHIVE" -C "$STAGE"

[[ -f "$STAGE/index.html" ]] || die "index.html missing"
[[ -f "$STAGE/sitemap.xml" ]] || die "sitemap.xml missing"
[[ -f "$STAGE/server/server.js" ]] || die "server.js missing"
[[ -f "$STAGE/package.json" ]] || die "package.json missing"
if find "$STAGE" -type l -print -quit | grep -q .; then die "symlinks are not allowed in release"; fi
if find "$STAGE" -type f -name '.env*' ! -name '.env.example' -print -quit | grep -q .; then die "environment file found in release"; fi
if find "$STAGE" -type f \( -name '*.bak*' -o -name '*.rollback-*' \) -print -quit | grep -q .; then die "backup artifact found in release"; fi

(cd "$STAGE" && node --check server/server.js)
printf '%s\n' "$EXPECTED_SHA256" > "$STAGE/RELEASE_ARCHIVE_SHA256"
printf '%s\n' "$SHA" > "$STAGE/REVISION"
chown -R www-data:www-data "$STAGE"
mv "$STAGE" "$RELEASE"

if [[ -L "$CURRENT" ]]; then
  PREVIOUS="$(readlink -f "$CURRENT")"
else
  PREVIOUS="$BASE/releases/legacy-$STAMP"
  mv "$CURRENT" "$PREVIOUS"
  PREVIOUS_WAS_DIRECTORY=1
fi

ln -s "$RELEASE" "$BASE/current.next"
mv -Tf "$BASE/current.next" "$CURRENT"
SWITCHED=1

systemctl restart oknproekt.service
sleep 2
systemctl is-active --quiet oknproekt.service

mapfile -t ROUTES < <(node --input-type=module - "$RELEASE/server/server.js" <<'NODE'
import { readFile } from "node:fs/promises";
const source = await readFile(process.argv[2], "utf8");
for (const match of source.matchAll(/\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g)) console.log(match[1]);
NODE
)

for route in "${ROUTES[@]}"; do
  curl -fsS --retry 2 --max-time 20 "https://oknproekt.ru$route" >/dev/null
done

NOT_FOUND_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 'https://oknproekt.ru/this-page-must-not-exist-cloud-publish')"
[[ "$NOT_FOUND_STATUS" == "404" ]] || die "404 smoke test returned $NOT_FOUND_STATUS"

printf 'previous=%s\nrelease=%s\n' "$PREVIOUS" "$RELEASE" >> "$BACKUP/MANIFEST.txt"
SWITCHED=0
trap - ERR
printf 'DEPLOY=SUCCESS\nRELEASE=%s\nBACKUP=%s\n' "$RELEASE" "$BACKUP"
