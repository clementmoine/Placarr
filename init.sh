#!/bin/sh
# All-in-one entrypoint (Plex-style): migrate → workers → Next in one container.
set -e

# PostgreSQL is expected healthy (compose depends_on). DATABASE_URL from env.

npx prisma migrate deploy

PIDS=""

cleanup() {
  for pid in $PIDS; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}

trap cleanup INT TERM

start_worker() {
  label=$1
  shift
  # shellcheck disable=SC2086
  env "$@" ./node_modules/.bin/tsx scripts/backgroundWorker.ts &
  pid=$!
  PIDS="$PIDS $pid"
  echo "[init] worker[$label] pid=$pid"
}

rebuild_title_idf() {
  echo "[init] rebuilding title IDF index…"
  if ./node_modules/.bin/tsx scripts/buildTokenCorpusIndex.ts; then
    echo "[init] title IDF index ready"
  else
    echo "[init] title IDF rebuild skipped (non-fatal)"
  fi
}

# Interactive enrich (metadata + prices). Set ENABLE_WORKERS=0 to disable.
if [ "${ENABLE_WORKERS:-1}" = "1" ]; then
  start_worker interactive \
    "WORKER_ID=${WORKER_ID:-placarr-worker}" \
    "WORKER_KINDS=interactive" \
    "WORKER_CONCURRENCY=${WORKER_CONCURRENCY:-6}"
fi

# iCollect catalog crawl. Set ENABLE_ICOLLECT_WORKER=0 to disable.
if [ "${ENABLE_ICOLLECT_WORKER:-1}" = "1" ]; then
  start_worker icollect \
    "WORKER_ID=${WORKER_ID_ICOLLECT:-placarr-icollect-worker}" \
    "WORKER_KINDS=catalog" \
    "WORKER_CONCURRENCY=${WORKER_ICOLLECT_CONCURRENCY:-1}"
fi

# Title-token DF from RawName / Item names — resolve loads the file, never Prisma.
# Set ENABLE_TITLE_IDF_BUILD=0 to skip the boot rebuild.
if [ "${ENABLE_TITLE_IDF_BUILD:-1}" = "1" ]; then
  rebuild_title_idf
fi

# Optional daily (or custom-interval) refresh. Workers pick up mtime changes live.
if [ "${ENABLE_TITLE_IDF_REFRESH:-0}" = "1" ]; then
  INTERVAL="${TITLE_IDF_REFRESH_SECONDS:-86400}"
  (
    while true; do
      sleep "$INTERVAL"
      rebuild_title_idf
    done
  ) &
  REFRESH_PID=$!
  PIDS="$PIDS $REFRESH_PID"
  echo "[init] title-idf refresh loop pid=$REFRESH_PID interval=${INTERVAL}s"
fi

echo "[init] starting Next.js"
# Standalone server (static/public already wired under .next/standalone).
cd /app/.next/standalone
node server.js &
NEXT_PID=$!
PIDS="$PIDS $NEXT_PID"

wait "$NEXT_PID"
STATUS=$?
cleanup
exit "$STATUS"
