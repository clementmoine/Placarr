#!/bin/sh
# Runs once, only when the PostgreSQL data directory is empty (docker-entrypoint
# initdb hook): a fresh volume — Docker Desktop reinstalled, new machine — is
# filled from the newest dump in /backups instead of starting blank.
# `prisma migrate deploy` afterwards applies any migration newer than the dump.
# Set RESTORE_ON_INIT=0 to start from an empty database instead.
set -eu

if [ "${RESTORE_ON_INIT:-1}" != "1" ]; then
  echo "[initdb] RESTORE_ON_INIT=0 — starting empty"
  exit 0
fi

latest="$(ls -1 /backups 2>/dev/null | grep -E '^placarr-[0-9]{8}-[0-9]{6}\.dump$' | sort | tail -n 1 || true)"
if [ -z "$latest" ]; then
  echo "[initdb] no dump in /backups — starting empty"
  exit 0
fi

echo "[initdb] restoring /backups/$latest into $POSTGRES_DB"
pg_restore --no-owner --no-privileges --exit-on-error \
  --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" "/backups/$latest"
echo "[initdb] restore done"
