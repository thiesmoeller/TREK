#!/usr/bin/env bash
set -euo pipefail

# TREK local development launcher.
# Installs missing workspace dependencies, builds shared contracts once, then
# runs shared watch, backend, and frontend for quick local testing.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[1;34m'
MAGENTA=$'\033[1;35m'
DIM=$'\033[1;90m'
RESET=$'\033[0m'

PIDS=()
CLEANED_UP=0

die() {
  echo "${RED}dev.sh:${RESET} $*" >&2
  exit 1
}

cleanup() {
  [ "$CLEANED_UP" = 1 ] && return
  CLEANED_UP=1

  echo
  echo "${YELLOW}Shutting down TREK...${RESET}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}

run() {
  local name="$1"
  shift

  (
    cd "$ROOT"
    printf '%s[%s]%s starting\n' "$GREEN" "$name" "$RESET"
    exec "$@"
  ) &
  PIDS+=("$!")
}

wait_for_shared_package() {
  local marker="$1"

  for _ in {1..80}; do
    if [ -f "$ROOT/shared/dist/index.js" ] &&
      [ "$ROOT/shared/dist/index.js" -nt "$marker" ] &&
      node -e "import('@trek/shared').then(() => {}, () => process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done

  die "shared watch did not produce a resolvable @trek/shared package"
}

with_node_option() {
  local option="$1"
  if [ -n "${NODE_OPTIONS:-}" ]; then
    printf '%s %s' "$NODE_OPTIONS" "$option"
  else
    printf '%s' "$option"
  fi
}

trap cleanup SIGINT SIGTERM EXIT

cd "$ROOT"

[ -f "$ROOT/package.json" ] || die "run this from the TREK repo root"
[ -f "$ROOT/package-lock.json" ] || die "package-lock.json missing; this launcher expects npm workspaces"
[ -f "$ROOT/shared/package.json" ] || die "shared/package.json missing"
[ -f "$ROOT/server/package.json" ] || die "server/package.json missing"
[ -f "$ROOT/client/package.json" ] || die "client/package.json missing"

command -v npm >/dev/null 2>&1 || die "npm is required"

echo "${BLUE}Starting TREK development environment...${RESET}"
echo "${DIM}root: $ROOT${RESET}"

if [ ! -d "$ROOT/node_modules" ]; then
  echo "${YELLOW}Root node_modules missing; installing workspace dependencies with npm ci...${RESET}"
  npm ci
fi

if [ ! -x "$ROOT/node_modules/.bin/tsup" ] || [ ! -x "$ROOT/node_modules/.bin/vite" ] || [ ! -x "$ROOT/node_modules/.bin/tsc" ]; then
  echo "${YELLOW}Workspace binaries missing; refreshing dependencies with npm ci...${RESET}"
  npm ci
fi

# Some shells export HOST as the machine hostname. The backend treats HOST as a
# bind address, so an inherited hostname can make local dev fail to start.
unset HOST

echo "${BLUE}Building shared contracts...${RESET}"
npm run build --workspace=shared

SHARED_MARKER="$(mktemp -t trek-shared-watch.XXXXXX)"
run "shared" npm run build:watch --workspace=shared
wait_for_shared_package "$SHARED_MARKER"
rm -f "$SHARED_MARKER"

run "server" env NODE_OPTIONS="$(with_node_option '--import tsx')" npm run dev --workspace=server
run "client" npm run dev --workspace=client -- --host 0.0.0.0

echo "${MAGENTA}TREK is starting:${RESET}"
echo "  frontend: http://localhost:5173"
echo "  backend:  http://localhost:3001"
echo "Press Ctrl+C to stop."

set +e
wait -n "${PIDS[@]}"
exit_code=$?
set -e
cleanup
exit "$exit_code"
