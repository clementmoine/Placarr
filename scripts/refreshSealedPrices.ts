#!/usr/bin/env npx tsx
/**
 * Backfill `priceCents` sur tous les index scellés (tous TCGs) :
 * jumeaux locale / printKeys / rôle retail, estimation display|trove =
 * min(booster set) × packs, alias slug connus.
 */
export {};

try {
  process.loadEnvFile(".env");
} catch {
  console.warn("(.env not loaded)");
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PROVIDER_MODULES } from "@/core/catalog/registry";
import { CATALOGUE_PACK_IDS } from "@/lib/admin/cataloguePacks";
import { packCatalogDb, packProductsIndexPath } from "@/lib/packPaths";
import { backfillSealedProductSetLogos } from "@/providers/shared/sealedProducts/backfillLogos";
import { mergeCuratedSealedContents } from "@/providers/shared/sealedProducts/curatedContents";
import {
  emptyProductsIndex,
  isProductsIndexV1,
  type ProductsIndexV1,
  type SealedProductEntry,
} from "@/providers/shared/sealedProducts/indexFormat";
import {
  loadProductsIndexFromSqlite,
  writeProductsIndexToSqlite,
} from "@/providers/shared/sealedProducts/productsSqlite";

function packHasSealedIndex(packId: string): boolean {
  return (
    existsSync(packCatalogDb(packId)) || existsSync(packProductsIndexPath(packId))
  );
}

function coalesceEntry(
  primary: SealedProductEntry,
  fallback: SealedProductEntry,
): SealedProductEntry {
  const price =
    typeof primary.priceCents === "number" && primary.priceCents > 0
      ? primary.priceCents
      : typeof fallback.priceCents === "number" && fallback.priceCents > 0
        ? fallback.priceCents
        : primary.priceCents ?? fallback.priceCents;
  return { ...fallback, ...primary, priceCents: price ?? null };
}

function loadRawSealedIndex(packId: string): ProductsIndexV1 {
  const fromSqlite = loadProductsIndexFromSqlite(packId);
  const jsonPath = packProductsIndexPath(packId);
  let fromJson: ProductsIndexV1 | null = null;
  if (existsSync(jsonPath)) {
    try {
      const raw: unknown = JSON.parse(readFileSync(jsonPath, "utf8"));
      fromJson = isProductsIndexV1(raw) ? raw : null;
    } catch {
      fromJson = null;
    }
  }
  if (fromSqlite && fromJson) {
    const products: Record<string, SealedProductEntry> = {
      ...fromJson.products,
    };
    for (const [key, entry] of Object.entries(fromSqlite.products)) {
      const prev = products[key];
      products[key] = prev ? coalesceEntry(entry, prev) : entry;
    }
    return { ...fromSqlite, products };
  }
  return fromSqlite ?? fromJson ?? emptyProductsIndex(packId);
}

function countPriced(products: Record<string, SealedProductEntry>): {
  total: number;
  priced: number;
  missing: number;
} {
  const rows = Object.values(products);
  let priced = 0;
  for (const entry of rows) {
    if (typeof entry.priceCents === "number" && entry.priceCents > 0) {
      priced += 1;
    }
  }
  return {
    total: rows.length,
    priced,
    missing: rows.length - priced,
  };
}

function refreshPackPrices(packId: string): {
  before: number;
  after: number;
  total: number;
  filled: number;
} {
  const raw = loadRawSealedIndex(packId);
  const before = countPriced(raw.products);
  const products = mergeCuratedSealedContents(packId, raw.products);
  const filled = backfillSealedProductSetLogos(packId, products);
  const after = countPriced(products);
  const index: ProductsIndexV1 = {
    version: 1,
    pack: packId,
    generatedAt: new Date().toISOString(),
    products,
  };
  const jsonPath = packProductsIndexPath(packId);
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  try {
    writeProductsIndexToSqlite(packId, index);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠ ${packId}: sqlite write skipped — ${msg}`);
  }
  return {
    before: before.missing,
    after: after.missing,
    total: after.total,
    filled,
  };
}

function main() {
  const packIds = [
    ...new Set([
      ...CATALOGUE_PACK_IDS,
      ...PROVIDER_MODULES.map((m) => m.catalog?.dataPack?.trim()).filter(
        (id): id is string => Boolean(id),
      ),
    ]),
  ].sort();

  console.log("=== Refresh sealed priceCents (all packs) ===\n");
  let totalBefore = 0;
  let totalAfter = 0;
  let totalSkus = 0;
  const stillMissing: { packId: string; missing: number; total: number }[] =
    [];

  for (const packId of packIds) {
    if (!packHasSealedIndex(packId)) continue;
    try {
      const row = refreshPackPrices(packId);
      totalBefore += row.before;
      totalAfter += row.after;
      totalSkus += row.total;
      const delta = row.before - row.after;
      console.log(
        `${packId}: missing ${row.before} → ${row.after}` +
          (delta > 0 ? ` (−${delta})` : "") +
          ` / ${row.total} SKUs (filled≈${row.filled})`,
      );
      if (row.after > 0) {
        stillMissing.push({
          packId,
          missing: row.after,
          total: row.total,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${packId}: FAILED — ${msg}`);
    }
  }

  console.log("\n=== Totals ===");
  console.log(
    `missing ${totalBefore} → ${totalAfter} (−${Math.max(0, totalBefore - totalAfter)}) / ${totalSkus} SKUs`,
  );

  if (stillMissing.length > 0) {
    console.log("\n=== Packs still with unpriced SKUs ===");
    for (const row of stillMissing) {
      console.log(`  ${row.packId}: ${row.missing}/${row.total}`);
    }
  }
}

main();
