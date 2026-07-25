#!/bin/sh
# All-in-one entrypoint (Plex-style): migrate → workers → Next in one container.
set -e

# PostgreSQL is expected healthy (compose depends_on). DATABASE_URL from env.

npx prisma migrate deploy

# Comptes admin/guest. Le seed est idempotent (upsert sans update), donc le
# rejouer à chaque boot ne réinitialise aucun mot de passe existant — sans lui
# une installation Docker n'a aucun administrateur, et l'inscription publique
# ne crée que des comptes `user`. ENABLE_SEED=0 pour s'en passer.
if [ "${ENABLE_SEED:-1}" = "1" ]; then
  echo "[init] seeding admin/guest accounts"
  npx prisma db seed
fi

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

# Watch every child, not just Next. Waiting on `$NEXT_PID` alone left a
# container that looked healthy with a dead worker: enrichment stopped silently
# and `restart: unless-stopped` never fired. Polling rather than `wait -n`,
# which busybox sh (alpine) does not reliably support.
while :; do
  for pid in $PIDS; do
    if ! kill -0 "$pid" 2>/dev/null; then
      if [ "$pid" = "$NEXT_PID" ]; then
        wait "$NEXT_PID" || true
        STATUS=$?
      else
        echo "[init] worker pid=$pid died — taking the container down"
        STATUS=1
      fi
      cleanup
      exit "$STATUS"
    fi
  done
  sleep 5
done
