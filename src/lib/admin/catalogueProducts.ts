/**
 * Paginated browse of `data/<pack>/products-index.json` for Catalogue → Scellés.
 */
import { readFileSync, statSync } from "node:fs";

import { packProductsIndexPath } from "@/lib/packPaths";
import {
  catalogueCorpusPack,
  type CataloguePackId,
} from "@/lib/admin/cataloguePacks";
import type { CatalogueSealedRow } from "@/lib/admin/catalogueProductsTypes";
import {
  emptyProductsIndex,
  isProductsIndexV1,
  type ProductsIndexV1,
  type SealedProductEntry,
} from "@/providers/shared/sealedProducts/indexFormat";

export type { CatalogueSealedRow } from "@/lib/admin/catalogueProductsTypes";

type PackCache = {
  mtimeMs: number;
  rows: CatalogueSealedRow[];
};

const cache = new Map<string, PackCache>();

export function resetCatalogueProductsCache(): void {
  cache.clear();
}

function indexMtimeMs(pack: string): number {
  try {
    return statSync(packProductsIndexPath(catalogueCorpusPack(pack))).mtimeMs;
  } catch {
    return 0;
  }
}

function loadIndex(pack: string): ProductsIndexV1 {
  const corpus = catalogueCorpusPack(pack);
  try {
    const raw = JSON.parse(
      readFileSync(packProductsIndexPath(corpus), "utf8"),
    ) as unknown;
    if (isProductsIndexV1(raw)) return raw;
  } catch {
    /* missing / invalid */
  }
  return emptyProductsIndex(corpus);
}

const KIND_ORDER: Record<SealedProductEntry["kind"], number> = {
  booster: 0,
  display: 1,
  deck: 2,
  coffret: 3,
};

export function buildCatalogueSealedRows(
  pack: string,
  index: ProductsIndexV1,
): CatalogueSealedRow[] {
  const rows: CatalogueSealedRow[] = [];
  for (const [productKey, entry] of Object.entries(index.products)) {
    const name = entry.name?.trim() || entry.slug;
    const printCount = entry.prints.length;
    const count =
      entry.declaredCardCount != null
        ? `${printCount}/${entry.declaredCardCount}`
        : String(printCount);
    rows.push({
      productKey,
      slug: entry.slug,
      kind: entry.kind,
      behavior: entry.behavior,
      name: entry.name,
      setCode: entry.setCode,
      image: entry.image,
      imageBack: entry.imageBack ?? null,
      setLogo: entry.setLogo ?? null,
      declaredCardCount: entry.declaredCardCount,
      printCount,
      contentsKnown: entry.contentsKnown,
      containsPrintsIsPreview: entry.containsPrintsIsPreview,
      label: entry.setCode
        ? `${entry.setCode} · ${name} · ${count}`
        : `${name} · ${count}`,
    });
  }
  rows.sort((a, b) => {
    const kind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (kind !== 0) return kind;
    return (a.setCode ?? a.slug).localeCompare(b.setCode ?? b.slug, undefined, {
      numeric: true,
    });
  });
  void pack;
  return rows;
}

function rowsForPack(pack: CataloguePackId): CatalogueSealedRow[] {
  const mtimeMs = indexMtimeMs(pack);
  const hit = cache.get(pack);
  if (hit && hit.mtimeMs === mtimeMs) return hit.rows;
  const rows = buildCatalogueSealedRows(pack, loadIndex(pack));
  cache.set(pack, { mtimeMs, rows });
  return rows;
}

export type ListCatalogueProductsInput = {
  pack: CataloguePackId;
  offset?: number;
  limit?: number;
  q?: string;
};

export type ListCatalogueProductsResult = {
  pack: CataloguePackId;
  total: number;
  offset: number;
  limit: number;
  products: CatalogueSealedRow[];
};

export function listCatalogueProducts(
  input: ListCatalogueProductsInput,
): ListCatalogueProductsResult {
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.min(200, Math.max(1, Math.floor(input.limit ?? 48)));
  let rows = rowsForPack(input.pack);
  const q = input.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (row) =>
        row.productKey.toLowerCase().includes(q) ||
        row.slug.toLowerCase().includes(q) ||
        row.label.toLowerCase().includes(q) ||
        row.kind.includes(q) ||
        (row.setCode?.toLowerCase().includes(q) ?? false) ||
        (row.name?.toLowerCase().includes(q) ?? false),
    );
  }
  return {
    pack: input.pack,
    total: rows.length,
    offset,
    limit,
    products: rows.slice(offset, offset + limit),
  };
}
