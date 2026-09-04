#!/usr/bin/env bash
# Runs the three backend processes together.
#
# They must run CONCURRENTLY, not chained with &&: each one is a long-lived
# server that never exits, so `a && b && c` would start `a` and stop there.
#
# Everything is prefixed by service and written to logs/run.log only — the
# terminal stays quiet apart from the startup banner. Follow it with:
#   tail -f apps/backend/logs/run.log

set -uo pipefail
cd "$(dirname "$0")/.."

LOG="logs/run.log"
mkdir -p logs
: > "$LOG"

# Kill the whole process group on exit, otherwise Ctrl-C leaves the worker and
# the Inngest dev server holding :3001 and :8288 and the next run fails to bind.
trap 'echo; echo "[dev-all] shutting down..."; kill 0 2>/dev/null; exit 0' EXIT INT TERM

run() {
  local name=$1; shift
  # sed -u keeps it unbuffered so lines land in the file as they happen.
  ( "$@" 2>&1 | sed -u "s/^/[$name] /" >> "$LOG" ) &
}

# The worker owns /api/inngest on :3001, and the Inngest dev server syncs
# against that URL on startup — so the worker goes first.
#
# Note: no --hot here. A hot reload restarts the process and orphans whatever
# BullMQ job is in flight, which then stalls and gets re-processed from the top
# with the same payload (maxStalledCount: 3). During an agent run that shows up
# as the same questions being asked again. Set WORKER_HOT=1 if you're editing
# worker code and don't care.
if [ "${WORKER_HOT:-0}" = "1" ]; then
  run worker  bun --hot src/lib/worker.ts
else
  run worker  bun src/lib/worker.ts
fi

sleep 2
run inngest bunx inngest-cli dev -u http://localhost:3001/api/inngest
run api     bun --hot src/index.ts

echo "[dev-all] worker  -> http://localhost:3001/api/inngest"
echo "[dev-all] inngest -> http://localhost:8288"
echo "[dev-all] logs    -> apps/backend/$LOG"
echo "[dev-all] follow  -> tail -f apps/backend/$LOG"
echo "[dev-all] Ctrl-C stops all three."

wait
