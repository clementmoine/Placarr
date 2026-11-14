/**
 * Per-pack sealed GTIN coverage report.
 *
 * Answers: how many catalogue SKUs carry a barcode, which source digs still
 * float unmapped, and which packs are still at 0 GTINs (Lorcana / Pokémon
 * shops especially — follow-up for parsers / retail digs).
 *
 * CardNexus sealed `externalIds` are Cardmarket / TCGPlayer product ids only —
 * those marketplace ids are **not** GTINs; never project them as barcodes.
 */
import { existsSync } from "node:fs";

import { packProductsIndexPath } from "@/lib/packPaths";

import type { SealedProductEntry } from "./indexFormat";
import { loadSealedProductsIndex } from "./persistProductsIndex";
import {
  mineSealedBarcodesFromPackSources,
  type MinedSlugBarcodes,
} from "./projectLedgerBarcodes";
import { sealedCataloguePackIds } from "./productsSqlite";

export type SealedBarcodePackAudit = {
  packId: string;
  /** Retail SKUs in the sealed index (after curated + source overlay). */
  skuCount: number;
  /** SKUs with at least one normalized GTIN. */
  skusWithBarcodes: number;
  /** Distinct GTINs attached to catalogue SKUs. */
  barcodeCount: number;
  /**
   * Source digs under `data/<pack>/sources/` that carry a slug+GTIN but that
   * slug is absent from the products index (not mapped).
   */
  orphanSourceSlugs: string[];
  /** Distinct GTINs on those orphan source rows. */
  orphanSourceBarcodes: string[];
  /** Whether `data/<pack>/products-index.json` exists on disk. */
  productsIndexExists: boolean;
};

export type SealedBarcodeAuditReport = {
  packs: SealedBarcodePackAudit[];
  /** Packs whose catalogue SKUs still have zero GTINs — follow-up list. */
  packsWithZeroGtins: string[];
  totals: {
    skuCount: number;
    skusWithBarcodes: number;
    barcodeCount: number;
    orphanSourceSlugCount: number;
    orphanSourceBarcodeCount: number;
  };
};

export type AuditSealedBarcodesOpts = {
  packIds?: readonly string[];
  loadProducts?: (packId: string) => Record<string, SealedProductEntry>;
  mineSources?: (packId: string) => Map<string, MinedSlugBarcodes>;
  productsIndexExists?: (packId: string) => boolean;
};

function defaultLoadProducts(
  packId: string,
): Record<string, SealedProductEntry> {
  return loadSealedProductsIndex(packId, { skipDiskFinalize: true }).products;
}

function productSlugSet(
  products: Record<string, SealedProductEntry>,
): Set<string> {
  const slugs = new Set<string>();
  for (const entry of Object.values(products)) {
    const slug = entry.slug?.trim();
    if (slug) slugs.add(slug);
  }
  return slugs;
}

function distinctBarcodes(
  products: Record<string, SealedProductEntry>,
): Set<string> {
  const codes = new Set<string>();
  for (const entry of Object.values(products)) {
    for (const code of entry.barcodes ?? []) {
      if (code) codes.add(code);
    }
  }
  return codes;
}

export function auditSealedBarcodesForPack(
  packId: string,
  opts: AuditSealedBarcodesOpts = {},
): SealedBarcodePackAudit {
  const loadProducts = opts.loadProducts ?? defaultLoadProducts;
  const mineSources = opts.mineSources ?? mineSealedBarcodesFromPackSources;
  const productsIndexExists =
    opts.productsIndexExists ??
    ((id: string) => existsSync(packProductsIndexPath(id)));

  const products = loadProducts(packId);
  const skus = Object.values(products);
  const skuCount = skus.length;
  const skusWithBarcodes = skus.filter(
    (entry) => (entry.barcodes?.length ?? 0) > 0,
  ).length;
  const barcodeCount = distinctBarcodes(products).size;

  const catalogueSlugs = productSlugSet(products);
  const mined = mineSources(packId);
  const orphanSourceSlugs: string[] = [];
  const orphanCodes = new Set<string>();
  for (const [slug, row] of mined) {
    if (catalogueSlugs.has(slug)) continue;
    orphanSourceSlugs.push(slug);
    for (const code of row.barcodes) orphanCodes.add(code);
  }
  orphanSourceSlugs.sort();

  return {
    packId,
    skuCount,
    skusWithBarcodes,
    barcodeCount,
    orphanSourceSlugs,
    orphanSourceBarcodes: [...orphanCodes].sort(),
    productsIndexExists: productsIndexExists(packId),
  };
}

export function auditSealedBarcodes(
  opts: AuditSealedBarcodesOpts = {},
): SealedBarcodeAuditReport {
  const packIds = opts.packIds ?? sealedCataloguePackIds();
  const packs = packIds.map((packId) => auditSealedBarcodesForPack(packId, opts));
  const packsWithZeroGtins = packs
    .filter((row) => row.skuCount > 0 && row.skusWithBarcodes === 0)
    .map((row) => row.packId);

  const totals = {
    skuCount: 0,
    skusWithBarcodes: 0,
    barcodeCount: 0,
    orphanSourceSlugCount: 0,
    orphanSourceBarcodeCount: 0,
  };
  for (const row of packs) {
    totals.skuCount += row.skuCount;
    totals.skusWithBarcodes += row.skusWithBarcodes;
    totals.barcodeCount += row.barcodeCount;
    totals.orphanSourceSlugCount += row.orphanSourceSlugs.length;
    totals.orphanSourceBarcodeCount += row.orphanSourceBarcodes.length;
  }

  return { packs, packsWithZeroGtins, totals };
}

/** CLI-friendly multi-line summary. */
export function formatSealedBarcodeAuditReport(
  report: SealedBarcodeAuditReport,
): string {
  const lines: string[] = [
    "Sealed barcode audit",
    `packs=${report.packs.length} skus=${report.totals.skuCount} withGtin=${report.totals.skusWithBarcodes} barcodes=${report.totals.barcodeCount} orphanSlugs=${report.totals.orphanSourceSlugCount} orphanCodes=${report.totals.orphanSourceBarcodeCount}`,
  ];
  if (report.packsWithZeroGtins.length) {
    lines.push(
      `zeroGtinPacks (${report.packsWithZeroGtins.length}): ${report.packsWithZeroGtins.join(", ")}`,
    );
  }
  for (const row of report.packs) {
    const orphans =
      row.orphanSourceSlugs.length > 0
        ? ` orphans=${row.orphanSourceSlugs.length}(${row.orphanSourceBarcodes.length} codes)`
        : "";
    lines.push(
      `  ${row.packId}: skus=${row.skuCount} withGtin=${row.skusWithBarcodes} barcodes=${row.barcodeCount} index=${row.productsIndexExists ? "yes" : "no"}${orphans}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
