#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p src/core

echo "==> identify (barcode + platforms)"
git mv src/core/barcode src/core/identify
git mv src/core/games src/core/identify/platforms

echo "==> enrich (metadata + media + titles + search)"
git mv src/core/metadata src/core/enrich
git mv src/core/media src/core/enrich/media
git mv src/core/title src/core/enrich/titles
git mv src/core/search src/core/enrich/search

echo "==> collect (item + jobs)"
git mv src/core/item src/core/collect
git mv src/core/jobs src/core/collect/jobs

echo "==> commerce (pricing + retailer)"
mkdir -p src/core/commerce
git mv src/core/pricing src/core/commerce/pricing
git mv src/core/retailer src/core/commerce/retailer

echo "==> catalog + locale unchanged"
echo DONE
