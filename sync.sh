#!/usr/bin/env bash
#
# Sync this bundle with the live repositories, or check it for drift.
#
# The repositories are authoritative. This bundle is a distributable copy, and a copy
# that nobody can verify is a copy that silently goes stale — which is exactly what
# happened to the first version of these folders: they kept OpenCode-format agent
# definitions for months after the repos had moved on, and described a frontend with
# no test runner after Vitest and Playwright had shipped.
#
#   ./sync.sh --check    # exit non-zero if the bundle differs from the repos
#   ./sync.sh --pull     # overwrite the bundle from the repos
#   ./sync.sh --install <path-to-repo> --repo backend|frontend
#                        # copy this bundle's agent system INTO a repository
#
# --check is the one to wire into a pre-push hook or CI. It is read-only.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# Both repos sit beside this bundle by default. Override for a different checkout.
ROOT="${GADDR_ROOT:-..}"

if [ -t 1 ]; then
  BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  BOLD=''; GREEN=''; RED=''; DIM=''; RESET=''
fi

# repo:relative-path pairs. Add a line here when a new agent-facing file is created —
# a file absent from this list is a file this script cannot protect.
#
# Docs 2 is the full documentation bundle, so it tracks docs/ as well as the agent
# system. Docs 1 tracks only the agent system.
PATHS=(
  "backend:AGENTS.md"
  "backend:.claude/agents"
  "backend:.claude/skills"
  "backend:docs"
  "backend:audit"
  "frontend:AGENTS.md"
  "frontend:.claude/agents"
  "frontend:.claude/skills"
  "frontend:docs"
)

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; }

MODE=""
INSTALL_DEST=""
INSTALL_REPO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check)   MODE=check ;;
    --pull)    MODE=pull ;;
    --install) MODE=install; INSTALL_DEST="${2:-}"; shift ;;
    --repo)    INSTALL_REPO="${2:-}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

[ -n "$MODE" ] || { usage >&2; exit 2; }

if [ "$MODE" = install ]; then
  [ -n "$INSTALL_DEST" ] || { echo "--install needs a destination path" >&2; exit 2; }
  [ -d "$INSTALL_DEST" ] || { echo "Not a directory: $INSTALL_DEST" >&2; exit 2; }
  case "$INSTALL_REPO" in
    backend|frontend) ;;
    *) echo "--repo must be 'backend' or 'frontend'" >&2; exit 2 ;;
  esac
  mkdir -p "$INSTALL_DEST/.claude"
  cp -R "$INSTALL_REPO/.claude/agents" "$INSTALL_DEST/.claude/"
  cp -R "$INSTALL_REPO/.claude/skills" "$INSTALL_DEST/.claude/"
  cp "$INSTALL_REPO/AGENTS.md" "$INSTALL_DEST/AGENTS.md"
  printf '%s✓ installed the %s agent system into %s%s\n' \
    "$GREEN" "$INSTALL_REPO" "$INSTALL_DEST" "$RESET"
  printf '%s  Review AGENTS.md — it describes this project, not a generic one.%s\n' \
    "$DIM" "$RESET"
  exit 0
fi

DRIFTED=()
MISSING=()

for entry in "${PATHS[@]}"; do
  repo="${entry%%:*}"
  rel="${entry#*:}"
  src="$ROOT/$repo/$rel"
  dst="$repo/$rel"

  if [ ! -e "$src" ]; then
    MISSING+=("$repo/$rel — not found at $src")
    continue
  fi

  if [ "$MODE" = pull ]; then
    mkdir -p "$(dirname "$dst")"
    if [ -d "$src" ]; then
      rm -rf "$dst"; mkdir -p "$dst"; cp -R "$src/." "$dst/"
    else
      cp "$src" "$dst"
    fi
    printf '%s  pulled %s%s\n' "$DIM" "$repo/$rel" "$RESET"
    continue
  fi

  # --check. Compare recursively, ignoring macOS metadata.
  if diff -r -q -x '.DS_Store' "$src" "$dst" >/dev/null 2>&1; then
    printf '%s  ✓ %s%s\n' "$GREEN" "$repo/$rel" "$RESET"
  else
    printf '%s  ✗ %s%s\n' "$RED" "$repo/$rel" "$RESET"
    diff -r -x '.DS_Store' "$src" "$dst" 2>&1 | sed 's/^/      /' | head -20
    DRIFTED+=("$repo/$rel")
  fi
done

printf '\n'

if [ ${#MISSING[@]} -gt 0 ]; then
  printf '%s✗ %d path(s) not found in the repositories:%s\n' "$RED$BOLD" "${#MISSING[@]}" "$RESET"
  for m in "${MISSING[@]}"; do printf '%s    - %s%s\n' "$RED" "$m" "$RESET"; done
  printf '%s  Set GADDR_ROOT to the directory containing backend/ and frontend/.%s\n' \
    "$DIM" "$RESET"
  exit 1
fi

if [ "$MODE" = pull ]; then
  printf '%s✓ bundle updated from the repositories%s\n' "$GREEN$BOLD" "$RESET"
  exit 0
fi

if [ ${#DRIFTED[@]} -eq 0 ]; then
  printf '%s✓ bundle matches the repositories%s\n' "$GREEN$BOLD" "$RESET"
  exit 0
fi

printf '%s✗ %d path(s) drifted:%s\n' "$RED$BOLD" "${#DRIFTED[@]}" "$RESET"
for d in "${DRIFTED[@]}"; do printf '%s    - %s%s\n' "$RED" "$d" "$RESET"; done
printf '\n%sIf the repositories are right (they usually are): ./sync.sh --pull%s\n' \
  "$DIM" "$RESET"
printf '%sIf the bundle is right: port the change into the repo, then --pull.%s\n' \
  "$DIM" "$RESET"
exit 1
