#!/usr/bin/env bash
#
# Is the live site serving the commit I have checked out?
#
# Written because answering that took two hours once: with no version endpoint,
# the live commit had to be inferred from the *contents of a 404 page*, grepping
# for a string only the newest build could produce. That works by luck, and not
# at all for a change with no visible surface.
#
#   ./scripts/verify-deploy.sh                      # against demo.gaddr.com
#   ./scripts/verify-deploy.sh https://staging.host  # anywhere else
#
# Exit 0 = both services are serving this commit. Non-zero = they are not, and
# the output says which and why. Safe to run from anywhere; it only does GETs.

set -uo pipefail

HOST="${1:-https://demo.gaddr.com}"
HOST="${HOST%/}"

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
YELLOW=$'\033[33m'; RESET=$'\033[0m'

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_SHA="$(git -C "$repo_root" rev-parse --short=7 HEAD 2>/dev/null || echo unknown)"
LOCAL_BRANCH="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"

printf '%sVerifying %s%s\n' "$BOLD" "$HOST" "$RESET"
printf '%slocal %s @ %s%s\n\n' "$DIM" "$LOCAL_BRANCH" "$LOCAL_SHA" "$RESET"

failures=0

# `commit` from a version endpoint, or empty if it is not there / not JSON.
remote_commit() {
  curl -fsS --max-time 20 "$1" 2>/dev/null \
    | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin).get("commit",""))
except Exception:
    pass' 2>/dev/null
}

check_service() {
  local label="$1" url="$2"
  local commit
  commit="$(remote_commit "$url")"

  if [ -z "$commit" ]; then
    # No version endpoint means the deploy predates it — which is itself the
    # answer: this commit is not live.
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url")"
    printf '  %s✗%s %-9s no version endpoint (HTTP %s)\n' "$RED" "$RESET" "$label" "$code"
    printf '      %sthe running build predates it, so it is not this commit%s\n' "$DIM" "$RESET"
    failures=$((failures + 1))
    return
  fi

  if [ "$commit" = "unknown" ]; then
    printf '  %s?%s %-9s serving, but cannot identify its commit\n' "$YELLOW" "$RESET" "$label"
    printf '      %sset BUILD_SHA in the pipeline%s\n' "$DIM" "$RESET"
    failures=$((failures + 1))
    return
  fi

  # Compare on the shorter of the two — the endpoints truncate to 12, git to 7.
  local n=${#commit}
  [ "$n" -gt 7 ] && n=7
  if [ "${commit:0:$n}" = "${LOCAL_SHA:0:$n}" ]; then
    printf '  %s✓%s %-9s %s\n' "$GREEN" "$RESET" "$label" "$commit"
  else
    printf '  %s✗%s %-9s %s %s(expected %s)%s\n' \
      "$RED" "$RESET" "$label" "$commit" "$DIM" "$LOCAL_SHA" "$RESET"
    failures=$((failures + 1))
  fi
}

check_service "backend"  "$HOST/api/v1/version"
check_service "frontend" "$HOST/api/version"

# A route that only exists in this work — a blunt second opinion, in case a
# version endpoint is reporting something the router disagrees with.
printf '\n%ssmoke%s\n' "$BOLD" "$RESET"
for path in "/community" "/api/v1/community/feed?limit=1"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$HOST$path")"
  if [ "$code" = "200" ]; then
    printf '  %s✓%s %-36s %s\n' "$GREEN" "$RESET" "$path" "$code"
  else
    printf '  %s✗%s %-36s %s\n' "$RED" "$RESET" "$path" "$code"
    failures=$((failures + 1))
  fi
done

echo
if [ "$failures" -eq 0 ]; then
  printf '%s✓ %s is serving %s%s\n' "$GREEN" "$HOST" "$LOCAL_SHA" "$RESET"
  exit 0
fi

printf '%s✗ %d check(s) failed — %s is not serving %s%s\n' \
  "$RED" "$failures" "$HOST" "$LOCAL_SHA" "$RESET"
printf '%sSee docs/DEPLOY_STATUS_2026-07-26.md for what to check, cheapest first.%s\n' \
  "$DIM" "$RESET"
exit 1
