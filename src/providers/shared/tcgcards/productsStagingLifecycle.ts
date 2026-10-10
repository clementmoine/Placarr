/**
 * TCG Cards sealed products — promote → ledger → purge staging HTML.
 *
 * Durable: ``data/<pack>/logs/<stagingFolder>/{products,listings}.json``.
 * Sync suivant : même hash → 0 crawl même si staging vide.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import path from "node:path";

import { packLogsDir } from "@/lib/packPaths";
import { foilPackDataDir } from "@/lib/runtimeData";
import {
  catalogArtefactIsFresh,
  hashCatalogArtefactBytes,
  packCatalogIngestLedgerPath,
  readCatalogIngestLedger,
  recordCatalogPromoteAndPurgeStaging,
} from "@/providers/shared/catalogIngestLedger";

export function tcgCardsProductsArtefactId(packId: string): string {
  return `tcgcards-products:${packId}`;
}

export function tcgCardsProductsStagingDir(
  packId: string,
  stagingFolder: string,
): string {
  return path.join(foilPackDataDir(packId), "staging", stagingFolder);
}

export function tcgCardsProductsDurableDir(
  packId: string,
  stagingFolder: string,
): string {
  return path.join(packLogsDir(packId), stagingFolder);
}

/** Prefer staging (fresh crawl), else durable logs copy. */
export function resolveTcgCardsProductsDir(
  packId: string,
  stagingFolder: string,
): string | null {
  const staging = tcgCardsProductsStagingDir(packId, stagingFolder);
  if (existsSync(path.join(staging, "products.json"))) return staging;
  const durable = tcgCardsProductsDurableDir(packId, stagingFolder);
  if (existsSync(path.join(durable, "products.json"))) return durable;
  return null;
}

export function tcgCardsProductsContentHash(productsJsonPath: string): string {
  return hashCatalogArtefactBytes(readFileSync(productsJsonPath));
}

export function ensureTcgCardsProductsDurable(opts: {
  packId: string;
  stagingFolder: string;
  stagingDir: string;
}): string {
  const durable = tcgCardsProductsDurableDir(opts.packId, opts.stagingFolder);
  mkdirSync(durable, { recursive: true });
  for (const name of ["products.json", "listings.json"] as const) {
    const src = path.join(opts.stagingDir, name);
    if (!existsSync(src)) continue;
    copyFileSync(src, path.join(durable, name));
  }
  return durable;
}

/**
 * After ingest OK: durable JSON under logs/ + purge staging (HTML + JSON).
 */
export function promoteAndPurgeTcgCardsProductsStaging(opts: {
  packId: string;
  stagingFolder: string;
  stagingDir?: string;
}): { purged: boolean; contentHash: string | null } {
  const staging =
    opts.stagingDir ?? tcgCardsProductsStagingDir(opts.packId, opts.stagingFolder);
  const productsPath = path.join(staging, "products.json");
  if (!existsSync(productsPath)) {
    // Already purged — durable may still hold the graph.
    const durable = path.join(
      tcgCardsProductsDurableDir(opts.packId, opts.stagingFolder),
      "products.json",
    );
    if (!existsSync(durable)) return { purged: false, contentHash: null };
    const contentHash = tcgCardsProductsContentHash(durable);
    recordCatalogPromoteAndPurgeStaging({
      ledgerPath: packCatalogIngestLedgerPath(opts.packId),
      artefactId: tcgCardsProductsArtefactId(opts.packId),
      contentHash,
      stagingPath: staging,
    });
    return { purged: true, contentHash };
  }
  const contentHash = tcgCardsProductsContentHash(productsPath);
  ensureTcgCardsProductsDurable({
    packId: opts.packId,
    stagingFolder: opts.stagingFolder,
    stagingDir: staging,
  });
  recordCatalogPromoteAndPurgeStaging({
    ledgerPath: packCatalogIngestLedgerPath(opts.packId),
    artefactId: tcgCardsProductsArtefactId(opts.packId),
    contentHash,
    stagingPath: staging,
  });
  return { purged: true, contentHash };
}

/** True when ingest ledger already holds this products.json hash. */
export function tcgCardsProductsLedgerFresh(
  packId: string,
  contentHash: string,
): boolean {
  return catalogArtefactIsFresh(
    readCatalogIngestLedger(packCatalogIngestLedgerPath(packId)),
    tcgCardsProductsArtefactId(packId),
    contentHash,
  );
}

/**
 * Skip crawl when durable products.json is ledger-fresh (staging may be empty).
 */
export function tcgCardsProductsSkipCrawl(opts: {
  packId: string;
  stagingFolder: string;
  force?: boolean;
}): {
  skip: boolean;
  dir: string | null;
  meta: {
    listingCount?: number;
    productCount?: number;
    printsLinked?: number;
  } | null;
} {
  if (opts.force) return { skip: false, dir: null, meta: null };
  const dir = resolveTcgCardsProductsDir(opts.packId, opts.stagingFolder);
  if (!dir) return { skip: false, dir: null, meta: null };
  const productsPath = path.join(dir, "products.json");
  const contentHash = tcgCardsProductsContentHash(productsPath);
  if (!tcgCardsProductsLedgerFresh(opts.packId, contentHash)) {
    return { skip: false, dir, meta: null };
  }
  let meta: {
    listingCount?: number;
    productCount?: number;
    printsLinked?: number;
  } | null = null;
  try {
    const raw = JSON.parse(readFileSync(productsPath, "utf8")) as {
      meta?: {
        listingCount?: number;
        productCount?: number;
        printsLinked?: number;
      };
    };
    meta = raw.meta ?? null;
  } catch {
    meta = null;
  }
  return { skip: true, dir, meta };
}
