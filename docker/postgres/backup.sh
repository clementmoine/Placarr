#!/bin/sh
# Logical PostgreSQL backups for Placarr (pg_dump custom format).
#
#   backup.sh once   one dump + retention, then exit   (pnpm db:backup)
#   backup.sh loop   dump every BACKUP_INTERVAL_SECONDS (compose `db-backup`)
#
# Dumps land in /backups as placarr-YYYYmmdd-HHMMSS.dump. They are written to
# /backups/.partial/ first and renamed only once complete and verified, so a
# file sync (Synology Drive skips dot-prefixed paths) never uploads half a dump.
#
# A dump — not a copy of the data directory — is the only format that restores
# across machines, CPU architectures and PostgreSQL major versions: it is what
# a migration to another host uses.
#
# Retention (age taken from the timestamp in the filename):
#   < BACKUP_KEEP_ALL_DAYS      every dump
#   < BACKUP_KEEP_DAILY_DAYS    first dump of each day
#   < BACKUP_KEEP_MONTHLY_DAYS  first dump of each month
#   older                       deleted
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-21600}"
KEEP_ALL_DAYS="${BACKUP_KEEP_ALL_DAYS:-7}"
KEEP_DAILY_DAYS="${BACKUP_KEEP_DAILY_DAYS:-35}"
KEEP_MONTHLY_DAYS="${BACKUP_KEEP_MONTHLY_DAYS:-365}"
DB="${PGDATABASE:-placarr}"

log() { echo "[db-backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

dump_once() {
  mkdir -p "$BACKUP_DIR/.partial"
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  name="placarr-$stamp.dump"
  tmp="$BACKUP_DIR/.partial/$name"
  log "dumping $DB → $name"
  pg_dump --format=custom --compress=6 --no-owner --no-privileges \
    --dbname="$DB" --file="$tmp"
  # A dump pg_restore cannot list is not a backup.
  pg_restore --list "$tmp" >/dev/null
  mv "$tmp" "$BACKUP_DIR/$name"
  log "ok $(du -h "$BACKUP_DIR/$name" | cut -f1) $name"
}

prune() {
  now="$(date -u +%s)"
  last_day=""
  last_month=""
  # Oldest first so the first dump of each day/month is the one kept.
  for f in $(ls -1 "$BACKUP_DIR" 2>/dev/null | grep -E '^placarr-[0-9]{8}-[0-9]{6}\.dump$' | sort); do
    day="$(echo "$f" | cut -c9-16)"
    month="$(echo "$day" | cut -c1-6)"
    ts="$(date -u -D %Y%m%d -d "$day" +%s 2>/dev/null || echo "$now")"
    age_days=$(( (now - ts) / 86400 ))
    keep=0
    if [ "$age_days" -lt "$KEEP_ALL_DAYS" ]; then
      keep=1
    elif [ "$age_days" -lt "$KEEP_DAILY_DAYS" ]; then
      [ "$day" != "$last_day" ] && keep=1
    elif [ "$age_days" -lt "$KEEP_MONTHLY_DAYS" ]; then
      [ "$month" != "$last_month" ] && keep=1
    fi
    if [ "$keep" = "1" ]; then
      # Only a kept dump counts as "the first of its day/month": an expired one
      # must not shadow the next dump of the same month.
      last_day="$day"
      last_month="$month"
    else
      log "prune $f (${age_days}d)"
      rm -f "$BACKUP_DIR/$f"
    fi
  done
  # Leftovers of an interrupted dump.
  find "$BACKUP_DIR/.partial" -type f -mmin +120 -delete 2>/dev/null || true
}

case "${1:-once}" in
  once)
    dump_once
    prune
    ;;
  loop)
    log "every ${INTERVAL}s into $BACKUP_DIR"
    until pg_isready -q; do sleep 2; done
    while :; do
      if dump_once; then prune; else log "dump FAILED"; fi
      sleep "$INTERVAL"
    done
    ;;
  *)
    echo "usage: $0 once|loop" >&2
    exit 2
    ;;
esac
