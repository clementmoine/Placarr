#!/bin/sh
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
if [ "${1-}" = "--" ]; then
  shift
fi
exec pnpm exec tsx scripts/pokemon/cdn.ts scrape "$@"
