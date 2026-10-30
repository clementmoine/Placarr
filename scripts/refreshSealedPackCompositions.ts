#!/usr/bin/env npx tsx
/**
 * Installe les graines `booster-composition.json` sous data/, re-merge les
 * index scellés (seed `packComposition` sur chaque SKU), persiste, et liste
 * les SKUs loterie encore sans grille.
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
import {
  curatedBoosterCompositionPath,
  type BoosterCompositionFile,
} from "@/providers/shared/sealedProducts/boosterComposition";
import { mergeCuratedSealedContents } from "@/providers/shared/sealedProducts/curatedContents";
import {
  emptyProductsIndex,
  isProductsIndexV1,
  type ProductsIndexV1,
} from "@/providers/shared/sealedProducts/indexFormat";
import { packCompositionCoverageForEntries } from "@/providers/shared/sealedProducts/packCompositionCoverage";
import {
  loadProductsIndexFromSqlite,
  writeProductsIndexToSqlite,
} from "@/providers/shared/sealedProducts/productsSqlite";

function installCompositionSeeds(): Map<string, boolean> {
  const installed = new Map<string, boolean>();
  for (const mod of PROVIDER_MODULES) {
    const load = mod.loadBoosterComposition;
    if (!load) continue;
    let file: BoosterCompositionFile | null = null;
    try {
      file = load() ?? null;
    } catch (err) {
      console.warn(
        `  ! ${mod.id}: loadBoosterComposition failed`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    if (!file || file.version !== 1) continue;
    /*
      dataPack catalogue si présent, sinon `file.pack` (lorcanajson n'a pas
      de dataPack mais porte la graine Lorcana).
    */
    const packId =
      mod.catalog?.dataPack?.trim() ||
      (typeof file.pack === "string" ? file.pack.trim() : "");
    if (!packId) continue;
    const dest = curatedBoosterCompositionPath(packId);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    installed.set(packId, true);
    console.log(`seed file → ${dest} (via ${mod.id})`);
  }
  return installed;
}

function packHasSealedIndex(packId: string): boolean {
  return (
    existsSync(packCatalogDb(packId)) || existsSync(packProductsIndexPath(packId))
  );
}

/** Load without logo backfill (évite un sqlite malformé type Lorcana). */
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
  return fromSqlite ?? fromJson ?? emptyProductsIndex(packId);
}

/**
 * Merge curated (seed composition) + write JSON (+ sqlite si possible).
 * Pas de backfill logos — le refresh composition ne doit pas dépendre d'eux.
 */
function refreshPackComposition(packId: string): ProductsIndexV1 {
  const raw = loadRawSealedIndex(packId);
  const products = mergeCuratedSealedContents(packId, raw.products);
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
  return index;
}

function main() {
  console.log("=== Install booster-composition seeds ===");
  const seeds = installCompositionSeeds();

  console.log("\n=== Refresh SKU packComposition + coverage ===");
  const unknownByPack: { packId: string; slugs: string[] }[] = [];
  let totalLottery = 0;
  let totalWith = 0;
  let totalMissing = 0;
  let totalNone = 0;

  const packIds = [
    ...new Set([
      ...CATALOGUE_PACK_IDS,
      ...[...seeds.keys()],
      ...PROVIDER_MODULES.map((m) => m.catalog?.dataPack?.trim()).filter(
        (id): id is string => Boolean(id),
      ),
    ]),
  ].sort();

  for (const packId of packIds) {
    if (!packHasSealedIndex(packId)) continue;

    try {
      const index = refreshPackComposition(packId);
      const cov = packCompositionCoverageForEntries(index.products);
      totalLottery += cov.lotterySkuCount;
      totalWith += cov.withCompositionCount;
      totalMissing += cov.missingCompositionCount;
      totalNone += cov.noneCount;

      const seedOk =
        seeds.get(packId) || existsSync(curatedBoosterCompositionPath(packId));
      console.log(
        `${packId}: lottery=${cov.lotterySkuCount} with=${cov.withCompositionCount} missing=${cov.missingCompositionCount} none=${cov.noneCount} seed=${seedOk ? "yes" : "NO"}`,
      );
      if (cov.missingSlugs.length > 0) {
        unknownByPack.push({ packId, slugs: cov.missingSlugs });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${packId}: FAILED — ${msg}`);
      unknownByPack.push({
        packId,
        slugs: [`(pack refresh failed: ${msg})`],
      });
    }
  }

  console.log("\n=== Totals ===");
  console.log(
    `lottery=${totalLottery} withComposition=${totalWith} missing=${totalMissing} none=${totalNone}`,
  );

  console.log("\n=== Unknown lottery SKUs (need packComposition) ===");
  if (unknownByPack.length === 0) {
    console.log("(none — every lottery SKU has a composition or is a container)");
  } else {
    for (const row of unknownByPack) {
      console.log(`\n[${row.packId}] ${row.slugs.length} SKU(s)`);
      for (const slug of row.slugs) console.log(`  - ${slug}`);
    }
  }

  const packsWithoutSeed = packIds.filter(
    (id) =>
      packHasSealedIndex(id) &&
      !seeds.get(id) &&
      !existsSync(curatedBoosterCompositionPath(id)),
  );
  if (packsWithoutSeed.length > 0) {
    console.log("\n=== Packs with sealed index but no booster-composition seed ===");
    for (const id of packsWithoutSeed) console.log(`  - ${id}`);
  }
}

main();
