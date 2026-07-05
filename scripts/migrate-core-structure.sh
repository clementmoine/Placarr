#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Creating src/core layout"
mkdir -p src/core

echo "==> Resolve metadata index.ts conflict"
if [[ -f src/lib/metadata/index.ts ]]; then
  git mv src/lib/metadata/index.ts src/lib/metadata/helperExports.ts
fi

move_lib() {
  local name="$1"
  if [[ -d "src/lib/$name" ]]; then
    git mv "src/lib/$name" "src/core/$name"
  fi
}

merge_service_into_core() {
  local name="$1"
  if [[ -d "src/services/$name" ]]; then
    for entry in src/services/"$name"/*; do
      base="$(basename "$entry")"
      if [[ -e "src/core/$name/$base" ]]; then
        echo "CONFLICT: src/core/$name/$base already exists" >&2
        exit 1
      fi
      git mv "$entry" "src/core/$name/"
    done
    rmdir "src/services/$name" 2>/dev/null || true
  fi
}

echo "==> Move lib domains → src/core"
for domain in barcode metadata pricing item media title locale jobs games retailer search; do
  move_lib "$domain"
done

echo "==> Merge services domains into src/core"
for domain in barcode metadata pricing; do
  merge_service_into_core "$domain"
done

echo "==> Move catalog (provider registry) + lib/provider helpers"
git mv src/services/provider src/core/catalog
if [[ -d src/lib/provider ]]; then
  for entry in src/lib/provider/*; do
    base="$(basename "$entry")"
    git mv "$entry" "src/core/catalog/$base"
  done
  rmdir src/lib/provider
fi

echo "==> Move provider plugins → src/providers"
git mv src/services/providers src/providers

echo "==> Rename lib/core → lib/shared (avoid clash with src/core)"
if [[ -d src/lib/core ]]; then
  git mv src/lib/core src/lib/shared
fi

echo "==> Done moving files"
