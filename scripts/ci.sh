#!/usr/bin/env bash
#
# Local mirror of the Cloud Build pipeline (cloudbuild.yaml).
#
# Run this before pushing. It executes the same gates in the same order, so a
# failure here is a failure in CI — no waiting on a remote build to find out.
#
#   ./scripts/ci.sh              # everything
#   ./scripts/ci.sh --fast       # skip the compile step (types + lint + tests)
#   ./scripts/ci.sh --no-secrets # skip the secret scan (if gitleaks is absent)
#
# Deliberately plain bash with no dependencies beyond the toolchain the project
# already needs: a CI script that itself needs installing does not get run.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

FAST=0
RUN_SECRETS=1
for arg in "$@"; do
  case "$arg" in
    --fast) FAST=1 ;;
    --no-secrets) RUN_SECRETS=0 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# Colour only when attached to a terminal, so piped output stays clean.
if [ -t 1 ]; then
  BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  BOLD=''; GREEN=''; RED=''; DIM=''; RESET=''
fi

FAILED=()
STEP_NUM=0

run_step() {
  local label="$1"; shift
  STEP_NUM=$((STEP_NUM + 1))

  printf '\n%s[%d] %s%s\n' "$BOLD" "$STEP_NUM" "$label" "$RESET"
  printf '%s    $ %s%s\n' "$DIM" "$*" "$RESET"

  local start
  start=$(date +%s)

  if "$@"; then
    printf '%s    ✓ %s (%ss)%s\n' "$GREEN" "$label" "$(( $(date +%s) - start ))" "$RESET"
  else
    printf '%s    ✗ %s (%ss)%s\n' "$RED" "$label" "$(( $(date +%s) - start ))" "$RESET"
    FAILED+=("$label")
  fi
}

printf '%sGaddr backend — CI gate%s\n' "$BOLD" "$RESET"
printf '%snode %s · npm %s%s\n' "$DIM" "$(node -v)" "$(npm -v)" "$RESET"

if [ ! -d node_modules ]; then
  printf '\n%snode_modules missing — installing%s\n' "$DIM" "$RESET"
  npm ci --no-audit --no-fund
fi

# Warning budget — a ratchet, not a target.
#
# `--max-warnings=0` would be ideal but this codebase carries 284 pre-existing
# warnings (239 of them no-unused-vars). Gating on zero today means the gate is
# red from day one, and a permanently red gate gets ignored.
#
# So: errors always fail, and warnings fail only if they INCREASE past this
# number. Lower it whenever you clean some up — never raise it.
LINT_WARNING_BUDGET=284

lint_step() {
  STEP_NUM=$((STEP_NUM + 1))
  printf '\n%s[%d] Lint%s\n' "$BOLD" "$STEP_NUM" "$RESET"
  printf '%s    $ npx eslint src --ext .ts (errors fail; warnings budget %d)%s\n' \
    "$DIM" "$LINT_WARNING_BUDGET" "$RESET"

  local output errors warnings
  output=$(npx eslint src --ext .ts 2>&1 || true)

  # Trailing summary line: "✖ N problems (E errors, W warnings)"
  errors=$(printf '%s' "$output" | sed -nE 's/.*\(([0-9]+) errors?, ([0-9]+) warnings?\).*/\1/p' | tail -1)
  warnings=$(printf '%s' "$output" | sed -nE 's/.*\(([0-9]+) errors?, ([0-9]+) warnings?\).*/\2/p' | tail -1)
  errors=${errors:-0}
  warnings=${warnings:-0}

  if [ "$errors" -gt 0 ]; then
    printf '%s' "$output" | grep -E '  error  ' | head -20
    printf '%s    ✗ Lint: %s error(s)%s\n' "$RED" "$errors" "$RESET"
    FAILED+=("Lint")
    return
  fi

  if [ "$warnings" -gt "$LINT_WARNING_BUDGET" ]; then
    printf '%s    ✗ Lint: warnings rose to %s (budget %s) — fix them or they compound%s\n' \
      "$RED" "$warnings" "$LINT_WARNING_BUDGET" "$RESET"
    FAILED+=("Lint (warning budget)")
    return
  fi

  if [ "$warnings" -lt "$LINT_WARNING_BUDGET" ]; then
    printf '%s    ✓ Lint: 0 errors, %s warnings — below budget, lower LINT_WARNING_BUDGET to %s%s\n' \
      "$GREEN" "$warnings" "$warnings" "$RESET"
  else
    printf '%s    ✓ Lint: 0 errors, %s warnings (at budget)%s\n' "$GREEN" "$warnings" "$RESET"
  fi
}

# Order mirrors cloudbuild.yaml: cheapest, highest-signal checks first.
run_step "Typecheck" npx tsc -p tsconfig.json --noEmit
lint_step
run_step "Tests" npx jest --ci --runInBand

if [ "$RUN_SECRETS" -eq 1 ]; then
  if command -v gitleaks >/dev/null 2>&1; then
    # --no-git scans the working tree. Full-history scanning is deliberately not
    # done here: two historical commits contain matches that are verified false
    # positives (long TypeScript identifiers tripping the twitter-api-key rule),
    # so a history scan can never go green without rewriting history.
    # .gitleaks.toml allowlists those and adds rules for the real risks —
    # committed database dumps and platform OAuth tokens.
    run_step "Secret scan" gitleaks detect --source=. --no-git \
      --config=.gitleaks.toml --redact --no-banner
  else
    printf '\n%s[-] Secret scan skipped — gitleaks not installed (brew install gitleaks)%s\n' "$DIM" "$RESET"
  fi
fi

if [ "$FAST" -eq 0 ]; then
  run_step "Build" npm run build
fi

printf '\n'
if [ ${#FAILED[@]} -eq 0 ]; then
  printf '%s✓ All checks passed%s\n' "$GREEN$BOLD" "$RESET"
  exit 0
fi

printf '%s✗ %d check(s) failed:%s\n' "$RED$BOLD" "${#FAILED[@]}" "$RESET"
for name in "${FAILED[@]}"; do
  printf '%s    - %s%s\n' "$RED" "$name" "$RESET"
done
exit 1
