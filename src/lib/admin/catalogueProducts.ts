/**
 * Paginated browse of `data/<pack>/products-index.json` for Catalogue → Scellés.
 */
import { statSync } from "node:fs";

import { packProductsIndexPath } from "@/lib/packPaths";
import {
  catalogueCorpusPack,
  cataloguePackInfo,
  type CataloguePackId,
} from "@/lib/admin/cataloguePacks";
import type {
  CatalogueSealedContainedProduct,
  CatalogueSealedDetail,
  CatalogueSealedRow,
} from "@/lib/admin/catalogueProductsTypes";
import { parsePrintKey } from "@/core/identify/printKey";
import { isCatalogueProductLang } from "@/providers/shared/cardCatalogue/catalogueLangs";
import {
  type ProductsIndexV1,
  type SealedPrintLink,
  type SealedProductEntry,
  sealedProductKey,
} from "@/providers/shared/sealedProducts/indexFormat";
import {
  SEALED_KIND_ORDER,
  withRefinedSealedKind,
} from "@/providers/shared/sealedProducts/kinds";
import { resolveSealedLang } from "@/providers/shared/sealedProducts/lang";
import { curatedProductsContentsPath } from "@/providers/shared/sealedProducts/curatedContents";
import { resolveSealedPackshotUrl } from "@/providers/shared/sealedProducts/packshotUrl";
import { loadSealedProductsIndex } from "@/providers/shared/sealedProducts/persistProductsIndex";
import { providerModuleForPack } from "@/providers/shared/packOwner";

export type {
  CatalogueSealedContainedProduct,
  CatalogueSealedDetail,
  CatalogueSealedRow,
} from "@/lib/admin/catalogueProductsTypes";


type PackCache = {
  mtimeMs: number;
  rows: CatalogueSealedRow[];
};

const cache = new Map<string, PackCache>();

export function resetCatalogueProductsCache(): void {
  cache.clear();
}

function fileMtimeMs(file: string): number {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/** Index + ledger curated — un changement de graine invalide le cache Catalogue. */
function indexMtimeMs(pack: string): number {
  const corpus = catalogueCorpusPack(pack);
  return (
    fileMtimeMs(packProductsIndexPath(corpus)) +
    fileMtimeMs(curatedProductsContentsPath(corpus))
  );
}

function loadIndex(pack: string): ProductsIndexV1 {
  return loadSealedProductsIndex(catalogueCorpusPack(pack));
}

export type ListCatalogueProductsInput = {
  pack: CataloguePackId;
  offset?: number;
  limit?: number;
  q?: string;
  /** Checklist queue: SKUs whose card list is not yet trusted. */
  contentsUnknown?: boolean;
};

export type ListCatalogueProductsResult = {
  pack: CataloguePackId;
  total: number;
  offset: number;
  limit: number;
  products: CatalogueSealedRow[];
};

function rowFromEntry(
  productKey: string,
  raw: SealedProductEntry,
  corpusPack?: string,
): CatalogueSealedRow {
  const entry = withRefinedSealedKind(raw);
  const name = entry.name?.trim() || entry.slug;
  const lang = resolveSealedLang({
    lang: entry.lang,
    slug: entry.slug,
  });
  /*
    Ledger curated inventorié → compteur = somme des qty garanties (starter 40,
    tin deck+promo), même si `contentsKnown` est encore false (liste partielle
    S5). Sinon un tin avec 27 garanties + 2 sachets affichait « 0/57 ».
  */
  const guaranteedCount = entry.guaranteedPrints.reduce(
    (n, print) => n + (print.qty ?? 1),
    0,
  );
  const printCount =
    guaranteedCount > 0 ? guaranteedCount : entry.prints.length;
  const count =
    entry.declaredCardCount != null
      ? `${printCount}/${entry.declaredCardCount}`
      : String(printCount);
  const image = corpusPack
    ? resolveSealedPackshotUrl({
        packId: corpusPack,
        slug: entry.slug,
        lang,
        fallback: entry.image,
      })
    : entry.image;
  return {
    productKey,
    slug: entry.slug,
    kind: entry.kind,
    behavior: entry.behavior,
    name: entry.name,
    setCode: entry.setCode,
    lang,
    image,
    imageBack: entry.imageBack ?? null,
    setLogo: entry.setLogo ?? null,
    declaredCardCount: entry.declaredCardCount,
    printCount,
    contentsKnown: entry.contentsKnown,
    containsPrintsIsPreview: entry.containsPrintsIsPreview,
    label: entry.setCode
      ? `${entry.setCode} · ${name} · ${count}`
      : `${name} · ${count}`,
  };
}

export function buildCatalogueSealedRows(
  pack: string,
  index: ProductsIndexV1,
): CatalogueSealedRow[] {
  const corpus = catalogueCorpusPack(pack);
  const locales = cataloguePackInfo(pack)?.catalogueLocales;
  const rows: CatalogueSealedRow[] = [];
  for (const [productKey, raw] of Object.entries(index.products)) {
    const row = rowFromEntry(productKey, raw, corpus);
    // Catalogue contract: original + FR + EN (pack locales). Hide DE/IT/ES
    // sealed tiles without deleting harvest ledgers.
    if (!isCatalogueProductLang(row.lang, locales)) continue;
    rows.push(row);
  }
  rows.sort((a, b) => {
    const kind = SEALED_KIND_ORDER[a.kind] - SEALED_KIND_ORDER[b.kind];
    if (kind !== 0) return kind;
    return (a.setCode ?? a.slug).localeCompare(b.setCode ?? b.slug, undefined, {
      numeric: true,
    });
  });
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

/**
 * Expand `randomPoolScope: "set"` into printKeys via the pack owner's
 * `listSetPrints` — the checklist dialog can show the lottery pool (DVD insert,
 * classic booster) without storing thousands of keys in products-contents.
 *
 * PrintKeys with a **grouping** (ex. `…-prerelease`) are channel alts, not the
 * anonymous set lottery — those belong in a `listed` pool (manga pack, …).
 */
export async function resolveSealedSetLotteryPool(input: {
  packId: string;
  setCode: string | null | undefined;
  lang: string | null | undefined;
  scope: string | null | undefined;
  existing: readonly SealedPrintLink[];
}): Promise<SealedPrintLink[]> {
  if (input.existing.length > 0) return [...input.existing];
  if (input.scope !== "set") return [...input.existing];
  const setId = input.setCode?.trim();
  if (!setId) return [];
  const owner = providerModuleForPack(input.packId);
  if (!owner?.listSetPrints) return [];
  const rows = await Promise.resolve(
    owner.listSetPrints({
      setId,
      language: input.lang,
    }),
  );
  return rows
    .filter((row) => {
      const id = parsePrintKey(row.printKey);
      return Boolean(id) && !id!.grouping;
    })
    .map((row) => ({
      name: row.title?.trim() || row.printKey,
      slug: row.printKey,
      ref: row.reference?.trim() || null,
      printKey: row.printKey,
    }));
}

function buildGuaranteedProducts(
  corpus: string,
  entry: SealedProductEntry,
  bySlug: Map<string, SealedProductEntry>,
): CatalogueSealedContainedProduct[] {
  return (entry.guaranteedProducts ?? []).map((link) => {
    const qty = link.qty != null && link.qty > 0 ? Math.floor(link.qty) : 1;
    const child = bySlug.get(link.slug);
    const refined = child ? withRefinedSealedKind(child) : null;
    const childLang = refined
      ? resolveSealedLang({ lang: refined.lang, slug: refined.slug })
      : null;
    return {
      slug: link.slug,
      qty,
      name: refined?.name ?? null,
      image: refined
        ? resolveSealedPackshotUrl({
            packId: corpus,
            slug: refined.slug,
            lang: childLang,
            fallback: refined.image,
          })
        : null,
      kind: refined?.kind ?? "coffret",
      productKey: sealedProductKey(corpus, link.slug),
      contentsKnown: refined?.contentsKnown ?? false,
    };
  });
}

export async function getCatalogueProductDetailAsync(
  pack: CataloguePackId,
  productKey: string,
): Promise<CatalogueSealedDetail | null> {
  const key = productKey.trim();
  if (!key) return null;
  const index = loadIndex(pack);
  const raw = index.products[key];
  if (!raw) return null;
  const entry = withRefinedSealedKind(raw);
  const corpus = catalogueCorpusPack(pack);
  const bySlug = new Map(
    Object.values(index.products).map((row) => [row.slug, row] as const),
  );
  const row = rowFromEntry(key, entry, corpus);
  const randomPoolPrints = await resolveSealedSetLotteryPool({
    packId: corpus,
    setCode: entry.setCode,
    lang: row.lang,
    scope: entry.randomPoolScope,
    existing: entry.randomPoolPrints,
  });
  return {
    ...row,
    cardsPerPack: entry.cardsPerPack,
    packsContained: entry.packsContained,
    packsBySet: entry.packsBySet ?? null,
    setCardCount: entry.setCardCount,
    randomPoolScope: entry.randomPoolScope,
    guaranteedProducts: buildGuaranteedProducts(corpus, entry, bySlug),
    guaranteedPrints: entry.guaranteedPrints,
    randomPoolPrints,
    prints: entry.prints,
  };
}

/** Sync detail — set lottery pools stay empty (no async `listSetPrints`). */
export function getCatalogueProductDetail(
  pack: CataloguePackId,
  productKey: string,
): CatalogueSealedDetail | null {
  const key = productKey.trim();
  if (!key) return null;
  const index = loadIndex(pack);
  const raw = index.products[key];
  if (!raw) return null;
  const entry = withRefinedSealedKind(raw);
  const corpus = catalogueCorpusPack(pack);
  const bySlug = new Map(
    Object.values(index.products).map((row) => [row.slug, row] as const),
  );
  return {
    ...rowFromEntry(key, entry, corpus),
    cardsPerPack: entry.cardsPerPack,
    packsContained: entry.packsContained,
    packsBySet: entry.packsBySet ?? null,
    setCardCount: entry.setCardCount,
    randomPoolScope: entry.randomPoolScope,
    guaranteedProducts: buildGuaranteedProducts(corpus, entry, bySlug),
    guaranteedPrints: entry.guaranteedPrints,
    randomPoolPrints: entry.randomPoolPrints,
    prints: entry.prints,
  };
}

export function listCatalogueProducts(
  input: ListCatalogueProductsInput,
): ListCatalogueProductsResult {
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.min(200, Math.max(1, Math.floor(input.limit ?? 48)));
  let rows = rowsForPack(input.pack);
  if (input.contentsUnknown) {
    rows = rows.filter((row) => !row.contentsKnown);
  }
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
