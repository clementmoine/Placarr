#!/bin/sh
# Restore a Placarr dump made by backup.sh.
#
#   restore.sh latest|<file.dump> [target_db]
#
# target_db defaults to `placarr_restore_test`: a scratch database, so testing a
# backup never touches the live one. Restoring over the live database
# ($PGDATABASE) drops it first and therefore requires FORCE=1 — stop Next and
# the workers before doing it.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
LIVE_DB="${PGDATABASE:-placarr}"
SRC="${1:-}"
TARGET="${2:-placarr_restore_test}"

if [ -z "$SRC" ]; then
  echo "usage: $0 latest|<file.dump> [target_db]" >&2
  exit 2
fi

if [ "$SRC" = "latest" ]; then
  SRC="$(ls -1 "$BACKUP_DIR" | grep -E '^placarr-[0-9]{8}-[0-9]{6}\.dump$' | sort | tail -n 1 || true)"
  [ -n "$SRC" ] || { echo "no dump in $BACKUP_DIR" >&2; exit 1; }
fi
case "$SRC" in /*) FILE="$SRC" ;; *) FILE="$BACKUP_DIR/$SRC" ;; esac
[ -f "$FILE" ] || { echo "not found: $FILE" >&2; exit 1; }

if [ "$TARGET" = "$LIVE_DB" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "refusing to overwrite the live database '$LIVE_DB' without FORCE=1" >&2
  exit 1
fi

echo "[db-restore] $(basename "$FILE") → $TARGET"
psql --dbname=postgres -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS \"$TARGET\" WITH (FORCE);" \
  -c "CREATE DATABASE \"$TARGET\";"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET" "$FILE"

echo "[db-restore] tables and row estimates in $TARGET:"
psql --dbname="$TARGET" -q -c "ANALYZE;" -c \
  "SELECT relname AS table, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY relname;"
