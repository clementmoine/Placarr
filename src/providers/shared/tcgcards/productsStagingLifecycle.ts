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
  catalogArtefactIsFreshWithin,
  hashCatalogArtefactBytes,
  packCatalogIngestLedgerPath,
  purgeStagingArtefact,
  readCatalogIngestLedger,
  recordCatalogPromoteAndPurgeStaging,
} from "@/providers/shared/catalogIngestLedger";

/**
 * Max age of a promoted products graph before Sync re-crawls the remote shop.
 * Shared by lorcards/pokecardex-style crawls and the Lorcana official site.
 */
export const TCG_CARDS_PRODUCTS_MAX_AGE_MS = 12 * 60 * 60 * 1000;

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
  /**
   * Skip-path: the crawl did not run, so do not bump `promotedAt` when the
   * ledger already holds this hash (otherwise the TTL would never elapse).
   */
  keepLedgerTimestamp?: boolean;
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
    if (opts.keepLedgerTimestamp && tcgCardsProductsLedgerFresh(opts.packId, contentHash)) {
      purgeStagingArtefact(staging);
      return { purged: true, contentHash };
    }
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
  if (opts.keepLedgerTimestamp && tcgCardsProductsLedgerFresh(opts.packId, contentHash)) {
    purgeStagingArtefact(staging);
    return { purged: true, contentHash };
  }
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
  /** Test seam — default {@link TCG_CARDS_PRODUCTS_MAX_AGE_MS}. */
  maxAgeMs?: number;
  now?: Date;
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
  // The hash is of our own durable copy, so it always matches after promote:
  // only the TTL lets a new remote SKU be discovered by a later Sync.
  if (
    !catalogArtefactIsFreshWithin(
      readCatalogIngestLedger(packCatalogIngestLedgerPath(opts.packId)),
      tcgCardsProductsArtefactId(opts.packId),
      contentHash,
      opts.maxAgeMs ?? TCG_CARDS_PRODUCTS_MAX_AGE_MS,
      opts.now,
    )
  ) {
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
