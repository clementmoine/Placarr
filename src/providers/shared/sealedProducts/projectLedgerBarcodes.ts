/**
 * Project ledger / dig GTINs onto sealed product entries by slug.
 *
 * Disk miner walks `data/<pack>/sources/` JSON trees for objects that carry a
 * product slug (or Bandai `stem`) plus `ean`/`upc`/`jan`/`gtin`/`barcode`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { packSyncedSourcesDir } from "@/lib/packPaths";

import {
  collectBarcodesFromLedgerRow,
  mergeSealedBarcodes,
} from "./barcodes";
import type { SealedProductEntry } from "./indexFormat";

export type LedgerBarcodeRow = {
  slug: string;
  barcodes: string[];
  source?: string;
};

export type MinedSlugBarcodes = {
  barcodes: string[];
  sources: Record<string, string>;
};

/** Prefer primary citations when both sides cite the same code. */
export function mergeSealedBarcodeSources(
  primary?: Record<string, string> | null,
  fill?: Record<string, string> | null,
): Record<string, string> | undefined {
  if (!primary && !fill) return undefined;
  const out: Record<string, string> = { ...(fill ?? {}) };
  for (const [code, citation] of Object.entries(primary ?? {})) {
    if (citation) out[code] = citation;
  }
  return Object.keys(out).length ? out : undefined;
}

function citationFromLedgerRow(
  row: Record<string, unknown>,
  fallback?: string,
): string | undefined {
  for (const field of [
    "host",
    "sourceId",
    "source",
    "listing",
    "referer",
    "url",
  ] as const) {
    const value = row[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function productSlugFromLedgerRow(
  row: Record<string, unknown>,
): string | null {
  for (const field of ["slug", "stem"] as const) {
    const value = row[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function entriesBySlug(
  products: Record<string, SealedProductEntry>,
): Map<string, string[]> {
  const bySlug = new Map<string, string[]>();
  for (const [key, entry] of Object.entries(products)) {
    const slug = entry.slug?.trim();
    if (!slug) continue;
    const list = bySlug.get(slug) ?? [];
    list.push(key);
    bySlug.set(slug, list);
  }
  return bySlug;
}

/**
 * Attach already-normalized barcode rows onto matching product slugs.
 * Returns how many product entries received at least one new code.
 */
export function applyLedgerBarcodesToProducts(
  products: Record<string, SealedProductEntry>,
  rows: readonly LedgerBarcodeRow[],
): number {
  const bySlug = entriesBySlug(products);
  let applied = 0;
  for (const row of rows) {
    const keys = bySlug.get(row.slug);
    if (!keys?.length) continue;
    const incoming = mergeSealedBarcodes([], row.barcodes);
    if (!incoming.length) continue;
    for (const key of keys) {
      const entry = products[key];
      if (!entry) continue;
      const before = entry.barcodes?.length ?? 0;
      const barcodes = mergeSealedBarcodes(entry.barcodes, incoming);
      const barcodeSources = mergeSealedBarcodeSources(
        entry.barcodeSources,
        row.source
          ? Object.fromEntries(incoming.map((code) => [code, row.source!]))
          : undefined,
      );
      const changed =
        barcodes.length !== before ||
        barcodes.some((code, i) => code !== entry.barcodes?.[i]);
      if (!changed && !row.source) continue;
      products[key] = {
        ...entry,
        barcodes,
        ...(barcodeSources ? { barcodeSources } : {}),
      };
      if (changed || (row.source && barcodeSources)) applied += 1;
    }
  }
  return applied;
}

/**
 * Collect GTINs from raw ledger rows (`ean`/`upc`/`jan`/…) and attach by slug.
 */
export function attachBarcodesFromLedgerRows(
  products: Record<string, SealedProductEntry>,
  _packId: string,
  rows: readonly Record<string, unknown>[],
  opts?: { sourceFallback?: string },
): number {
  const projected: LedgerBarcodeRow[] = [];
  for (const row of rows) {
    const slug = productSlugFromLedgerRow(row);
    if (!slug) continue;
    const barcodes = collectBarcodesFromLedgerRow(row);
    if (!barcodes.length) continue;
    projected.push({
      slug,
      barcodes,
      source: citationFromLedgerRow(row, opts?.sourceFallback),
    });
  }
  return applyLedgerBarcodesToProducts(products, projected);
}

/** Map JSON product objects (slug or stem) onto the sealed index. */
export function projectBarcodesFromJsonProducts(
  products: Record<string, SealedProductEntry>,
  ledgerProducts: ReadonlyArray<Record<string, unknown> & { slug?: string }>,
): number {
  return attachBarcodesFromLedgerRows(products, "", ledgerProducts);
}

function walkJsonFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkJsonFiles(abs, out);
      continue;
    }
    if (st.isFile() && name.endsWith(".json")) out.push(abs);
  }
  return out;
}

function visitObjects(
  value: unknown,
  visit: (obj: Record<string, unknown>) => void,
): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) visitObjects(item, visit);
    return;
  }
  const obj = value as Record<string, unknown>;
  visit(obj);
  for (const child of Object.values(obj)) visitObjects(child, visit);
}

/**
 * Pack-agnostic disk miner: scan JSON under a pack data `sources/` tree
 * for objects with slug/stem + retail GTIN fields.
 */
export function mineSourceBarcodes(
  packDataDirOrSources: string,
): Map<string, MinedSlugBarcodes> {
  const sourcesDir = packDataDirOrSources.endsWith(`${path.sep}sources`)
    || packDataDirOrSources.endsWith("/sources")
    || packDataDirOrSources.endsWith("\\sources")
    ? packDataDirOrSources
    : path.join(packDataDirOrSources, "sources");
  const mined = new Map<string, MinedSlugBarcodes>();
  for (const file of walkJsonFiles(sourcesDir)) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const fileTag = path.basename(file, ".json");
    visitObjects(raw, (obj) => {
      const slug = productSlugFromLedgerRow(obj);
      if (!slug) return;
      const barcodes = collectBarcodesFromLedgerRow(obj);
      if (!barcodes.length) return;
      const citation = citationFromLedgerRow(obj, fileTag) ?? fileTag;
      const prev = mined.get(slug) ?? { barcodes: [], sources: {} };
      const merged = mergeSealedBarcodes(prev.barcodes, barcodes);
      const sources = { ...prev.sources };
      for (const code of barcodes) {
        if (!sources[code]) sources[code] = citation;
      }
      mined.set(slug, { barcodes: merged, sources });
    });
  }
  return mined;
}

/** Mine `data/<pack>/sources/` JSON trees. */
export function mineSealedBarcodesFromPackSources(
  packId: string,
): Map<string, MinedSlugBarcodes> {
  return mineSourceBarcodes(packSyncedSourcesDir(packId));
}

/** Overlay mined pack-source barcodes onto an in-memory products map. */
export function overlayMinedBarcodesOntoProducts(
  products: Record<string, SealedProductEntry>,
  packId: string,
): number {
  const mined = mineSealedBarcodesFromPackSources(packId);
  if (!mined.size) return 0;
  const bySlug = entriesBySlug(products);
  let applied = 0;
  for (const [slug, row] of mined) {
    const keys = bySlug.get(slug);
    if (!keys?.length) continue;
    for (const key of keys) {
      const entry = products[key];
      if (!entry) continue;
      const barcodes = mergeSealedBarcodes(entry.barcodes, row.barcodes);
      const barcodeSources = mergeSealedBarcodeSources(
        entry.barcodeSources,
        row.sources,
      );
      const codesChanged =
        barcodes.length !== (entry.barcodes?.length ?? 0) ||
        barcodes.some((code, i) => code !== entry.barcodes?.[i]);
      const sourcesChanged =
        JSON.stringify(entry.barcodeSources ?? null) !==
        JSON.stringify(barcodeSources ?? null);
      if (!codesChanged && !sourcesChanged) continue;
      products[key] = {
        ...entry,
        barcodes,
        ...(barcodeSources ? { barcodeSources } : {}),
      };
      applied += 1;
    }
  }
  return applied;
}
