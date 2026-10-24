/**
 * Paginated browse of `data/<pack>/products-index.json` for Catalogue → Scellés.
 */
import { statSync } from "node:fs";

import { packCatalogDb, packProductsIndexPath } from "@/lib/packPaths";
import {
  catalogueCorpusPack,
  cataloguePackInfo,
  type CataloguePackId,
} from "@/lib/admin/cataloguePacks";
import { toContentsTree } from "@/core/collect/sealedContentsTree";
import { parsePrintKey } from "@/core/identify/printKey";
import { isCatalogueProductLang } from "@/providers/shared/cardCatalogue/catalogueLangs";
import type { PackCompositionField } from "@/providers/shared/sealedProducts/packCompositionTypes";
import { sealedLotteryPoolForSku } from "@/providers/shared/sealedProducts/lotteryChaseSplit";
import {
  type ProductsIndexV1,
  type SealedPrintLink,
  type SealedProductEntry,
  sealedProductKey,
  type RandomPoolScope,
} from "@/providers/shared/sealedProducts/indexFormat";
import {
  SEALED_KIND_ORDER,
  sealedProductDisplayName,
  withRefinedSealedKind,
  type SealedBehavior,
  type SealedKind,
} from "@/providers/shared/sealedProducts/kinds";
import { resolveSealedLang } from "@/providers/shared/sealedProducts/lang";
import { curatedProductsContentsPath } from "@/providers/shared/sealedProducts/curatedContents";
import { sealedStructureAttested } from "@/providers/shared/sealedProducts/contentLayers";
import { resolveSealedPackshotUrl } from "@/providers/shared/sealedProducts/packshotUrl";
import { resolveSealedProductFace } from "@/providers/shared/sealedProducts/resolveProductFace";
import { assetsSealedProductRoleUrl } from "@/lib/packAssetUrls";
import { loadSealedProductsIndex } from "@/providers/shared/sealedProducts/persistProductsIndex";
import { providerModuleProviding } from "@/providers/shared/packOwner";

export type CatalogueSealedRow = {
  productKey: string;
  slug: string;
  kind: SealedKind;
  behavior: SealedBehavior;
  name: string | null;
  setCode: string | null;
  /** ISO-ish locale from the products-index (`fr`, `EN`, `ptbr`, …). */
  lang: string | null;
  image: string | null;
  /** Dos de l'emballage, quand une source l'a photographié. Rare. */
  imageBack: string | null;
  /** Affiche checklist fournie avec le deck (ex. Série 9 Héros). */
  poster: string | null;
  setLogo: string | null;
  declaredCardCount: number | null;
  printCount: number;
  contentsKnown: boolean;
  containsPrintsIsPreview: boolean;
  /**
   * Quantité / pool attestés (booster 12 + set, display 24…) — pas la
   * checklist carte-à-carte (`contentsKnown`).
   */
  structureAttested: boolean;
  cardsPerPack: number | null;
  packsContained: number | null;
  randomPoolScope: RandomPoolScope;
  /** Boutique / dump (*cards.fr…) — `null` = pas encore coté. */
  priceCents: number | null;
  label: string;
};

/** Produit scellé résolu pour la checklist (packshot + qty). */
export type CatalogueSealedContainedProduct = {
  slug: string;
  qty: number;
  name: string | null;
  image: string | null;
  kind: SealedKind;
  productKey: string;
  contentsKnown: boolean;
  /** false when the child slug is absent from the pack index. */
  resolvable: boolean;
};

/** Nœud aléatoire résolu pour l'UI admin (résumé honnête, pas de tuiles). */
export type CatalogueSealedRandomNode = {
  packs: number;
  cardsPerPack: number;
  pool: RandomPoolScope;
  setId?: string;
};

/** Unité taille connue sans liste (Gateway decks, starter 2×60). */
export type CatalogueSealedStructureUnit = {
  label: string;
  count: number;
  cardsEach: number;
};

/** Full SKU payload for the Scellés content dialog (checklist). */
export type CatalogueSealedDetail = CatalogueSealedRow & {
  cardsPerPack: number | null;
  packsContained: number | null;
  packsBySet: Record<string, number> | null;
  setCardCount: number | null;
  /**
   * Composition de sachet (slots) — fait SKU. `null` = non vérifié ;
   * `"none"` = pas de loterie ; objet = grille attestée.
   */
  packComposition: PackCompositionField;
  randomPoolScope: RandomPoolScope;
  /** SKUs scellés inclus (starters / boosters d'un pack multi-produits). */
  guaranteedProducts: CatalogueSealedContainedProduct[];
  /**
   * Tirages aléatoires issus de l'arbre (`packs × cardsPerPack`), distincts
   * du pool marketing `randomPoolPrints`.
   */
  contentsRandom: CatalogueSealedRandomNode[];
  /** Blocs taille connue sans inventaire carte-à-carte. */
  contentsUnits: CatalogueSealedStructureUnit[];
  guaranteedPrints: SealedPrintLink[];
  randomPoolPrints: SealedPrintLink[];
  /** Shop / curated union list — preview tiles when `containsPrintsIsPreview`. */
  prints: SealedPrintLink[];
};

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

/**
 * Index + ledger curated — un changement de graine invalide le cache Catalogue.
 * `catalog.sqlite` is the SSOT for TCG Cards packs (Masters / Fusion / …);
 * watching only `products-index.json` left the Scellés grid empty after sync
 * when that JSON projection is absent.
 */
function indexMtimeMs(pack: string): number {
  const corpus = catalogueCorpusPack(pack);
  return (
    fileMtimeMs(packCatalogDb(corpus)) +
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
  /** Checklist queue: SKUs without a trusted card list **and** without attested structure. */
  contentsUnknown?: boolean;
  /** Audit queue: SKUs with no positive `priceCents` in the products-index. */
  missingPrice?: boolean;
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
  const lang = resolveSealedLang({
    lang: entry.lang,
    slug: entry.slug,
  });
  const name = sealedProductDisplayName({
    name: entry.name,
    kind: entry.kind,
    slug: entry.slug,
    packsInContainer: entry.packsContained,
    locale: lang,
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
  const structureAttested = sealedStructureAttested({
    kind: entry.kind,
    behavior: entry.behavior,
    contentsKnown: entry.contentsKnown,
    cardsPerPack: entry.cardsPerPack,
    packsContained: entry.packsContained,
    randomPoolScope: entry.randomPoolScope,
    guaranteedPrintCount: guaranteedCount,
    declaredCardCount: entry.declaredCardCount,
  });
  /*
    Opaque random packs / containers: prefer attested structure in the
    tile count (12 · pool set) over shop preview fractions (15/222).
  */
  let count: string;
  if (entry.contentsKnown || guaranteedCount > 0) {
    count =
      entry.declaredCardCount != null
        ? `${printCount}/${entry.declaredCardCount}`
        : String(printCount);
  } else if (
    structureAttested &&
    entry.behavior === "pack_container" &&
    entry.packsContained != null
  ) {
    count = String(entry.packsContained);
  } else if (
    structureAttested &&
    entry.cardsPerPack != null &&
    entry.randomPoolScope === "set"
  ) {
    count = String(entry.cardsPerPack);
  } else if (
    structureAttested &&
    entry.randomPoolScope === "set"
  ) {
    // Pokémon etc. — pool known, pack size not attested → set size hint only.
    count =
      entry.declaredCardCount != null
        ? `set~${entry.declaredCardCount}`
        : "set";
  } else if (
    structureAttested &&
    entry.packsContained != null &&
    entry.cardsPerPack != null
  ) {
    count = `${entry.packsContained}×${entry.cardsPerPack}`;
  } else if (
    structureAttested &&
    entry.packsContained != null &&
    entry.packsContained > 1
  ) {
    count = String(entry.packsContained);
  } else if (structureAttested && entry.behavior === "known_bundle") {
    count =
      entry.declaredCardCount != null
        ? `${printCount}/${entry.declaredCardCount}`
        : printCount > 0
          ? String(printCount)
          : "deck";
  } else if (entry.declaredCardCount != null && !entry.containsPrintsIsPreview) {
    count = `${printCount}/${entry.declaredCardCount}`;
  } else if (entry.containsPrintsIsPreview) {
    count =
      entry.declaredCardCount != null
        ? `~${entry.declaredCardCount}`
        : "—";
  } else {
    count = String(printCount);
  }
  const image = corpusPack
    ? resolveSealedPackshotUrl({
        packId: corpusPack,
        slug: entry.slug,
        lang,
        fallback: entry.image,
      })
    : entry.image;
  const imageBack = corpusPack
    ? (() => {
        const hit = resolveSealedProductFace({
          packId: corpusPack,
          slug: entry.slug,
          lang,
          role: "back",
        });
        return hit
          ? assetsSealedProductRoleUrl(corpusPack, entry.slug, lang, "back")
          : (entry.imageBack ?? null);
      })()
    : (entry.imageBack ?? null);
  return {
    productKey,
    slug: entry.slug,
    kind: entry.kind,
    behavior: entry.behavior,
    name: entry.name,
    setCode: entry.setCode,
    lang,
    image,
    imageBack,
    poster: entry.poster ?? null,
    setLogo: entry.setLogo ?? null,
    declaredCardCount: entry.declaredCardCount,
    printCount,
    contentsKnown: entry.contentsKnown,
    containsPrintsIsPreview: entry.containsPrintsIsPreview,
    structureAttested,
    cardsPerPack: entry.cardsPerPack,
    packsContained: entry.packsContained,
    randomPoolScope: entry.randomPoolScope,
    priceCents:
      typeof entry.priceCents === "number" && entry.priceCents > 0
        ? entry.priceCents
        : null,
    label: sealedRowLabel(corpusPack ?? "", entry.setCode, name, count),
  };
}

function sealedRowLabel(
  pack: string,
  setCode: string | null | undefined,
  name: string,
  count: string,
): string {
  const code = setCode?.trim();
  if (!code) return `${name} · ${count}`;
  const owner = providerModuleProviding(pack, "labelPrintSet");
  const set =
    owner?.labelPrintSet?.({ setCode: code })?.trim() || code;
  return `${set} · ${name} · ${count}`;
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
function mapLotteryRows(
  rows: readonly {
    printKey: string;
    title?: string | null;
    reference?: string | null;
  }[],
): SealedPrintLink[] {
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
  const owner = providerModuleProviding(input.packId, "listSetPrints");
  if (!owner?.listSetPrints) return [];
  const lang = input.lang?.trim() || null;
  const rows = await Promise.resolve(
    owner.listSetPrints({
      setId,
      language: lang,
    }),
  );
  const mapped = mapLotteryRows(rows);
  if (mapped.length > 0 || !lang) return mapped;
  /*
    Titres souvent JA-only (Bleach SCB, …) alors que le SKU boutique est FR :
    un filtre langue strict viderait le pool alors que le set existe.
  */
  const fallback = await Promise.resolve(
    owner.listSetPrints({ setId, language: null }),
  );
  return mapLotteryRows(fallback);
}

/** Shop abbr / setCode → id catalogue (logos / resolveCatalogueSetId). */
export function resolveSealedLotterySetId(input: {
  packId: string;
  setCode: string | null | undefined;
  catalogueSetId: string | null | undefined;
  slug?: string | null;
  name?: string | null;
}): string | null {
  const fromEntry =
    input.catalogueSetId?.trim() || input.setCode?.trim() || null;
  if (input.catalogueSetId?.trim()) return input.catalogueSetId.trim();
  const owner = providerModuleProviding(input.packId, "resolveCatalogueSetId");
  const resolved = owner?.resolveCatalogueSetId?.({
    setCode: input.setCode,
    slug: input.slug,
    name: input.name,
  });
  return resolved?.trim() || fromEntry;
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
      name: refined
        ? sealedProductDisplayName({
            name: refined.name,
            kind: refined.kind,
            slug: refined.slug,
            packsInContainer: refined.packsContained,
            locale: childLang,
          })
        : null,
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
      resolvable: Boolean(refined),
    };
  });
}

function entryContentsSource(entry: SealedProductEntry) {
  return {
    kind: entry.kind,
    behavior: entry.behavior,
    contentsKnown: entry.contentsKnown,
    printsArePreview: entry.containsPrintsIsPreview,
    guaranteedPrints: entry.guaranteedPrints,
    cardCount: entry.declaredCardCount,
    cardsPerPack: entry.cardsPerPack,
    packsContained: entry.packsContained,
    packsBySet: entry.packsBySet,
    randomPoolScope: entry.randomPoolScope,
    randomPoolPrints: (entry.randomPoolPrints ?? []).map(
      (row) => row.printKey ?? "",
    ),
    guaranteedProducts: entry.guaranteedProducts,
    structureUnits: entry.structureUnits,
  };
}

function buildContentsRandom(
  entry: SealedProductEntry,
): CatalogueSealedRandomNode[] {
  return toContentsTree(entryContentsSource(entry))
    .filter(
      (node): node is Extract<typeof node, { kind: "random" }> =>
        node.kind === "random" && node.pool !== "listed",
    )
    .map((node) => ({
      packs: node.packs,
      cardsPerPack: node.cardsPerPack,
      pool: node.pool,
      ...(node.setId ? { setId: node.setId } : {}),
    }));
}

function buildContentsUnits(
  entry: SealedProductEntry,
): CatalogueSealedStructureUnit[] {
  return toContentsTree(entryContentsSource(entry))
    .filter(
      (node): node is Extract<typeof node, { kind: "units" }> =>
        node.kind === "units",
    )
    .map((node) => ({
      label: node.label,
      count: node.count,
      cardsEach: node.cardsEach,
    }));
}

function needsPrintEnrichment(link: SealedPrintLink): boolean {
  const key = link.printKey?.trim();
  if (!key) return false;
  const name = link.name?.trim() || "";
  const image = link.image?.trim() || "";
  return !image || !name || name === key;
}

/**
 * Fill title / art on curated print links via the pack owner's `lookupPrint`
 * (merge stores name=printKey when only keys are curated).
 */
export async function enrichSealedPrintLinks(input: {
  packId: string;
  lang: string | null | undefined;
  prints: readonly SealedPrintLink[];
}): Promise<SealedPrintLink[]> {
  if (!input.prints.length) return [];
  const owner = providerModuleProviding(input.packId, "lookupPrint");
  if (!owner?.lookupPrint) return [...input.prints];
  const lang = input.lang?.trim() || null;
  return Promise.all(
    input.prints.map(async (link) => {
      if (!needsPrintEnrichment(link)) return link;
      const printKey = link.printKey!.trim();
      try {
        const found = await owner.lookupPrint!({
          printKey,
          language: lang,
        });
        if (!found) return link;
        const title = found.title?.trim() || null;
        const image =
          found.imageUrl?.trim() || found.thumbnailUrl?.trim() || null;
        const nameIsPlaceholder =
          !link.name?.trim() || link.name.trim() === printKey;
        return {
          ...link,
          name:
            nameIsPlaceholder && title
              ? title
              : link.name?.trim() || title || printKey,
          ...(image && !link.image?.trim() ? { image } : {}),
          ...(found.reference?.trim() && !link.ref
            ? { ref: found.reference.trim() }
            : {}),
        };
      } catch {
        return link;
      }
    }),
  );
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
  const lotterySetId = resolveSealedLotterySetId({
    packId: corpus,
    setCode: entry.setCode,
    catalogueSetId: entry.catalogueSetId,
    slug: entry.slug,
    name: entry.name,
  });
  const [rawPool, guaranteedPrints] = await Promise.all([
    resolveSealedSetLotteryPool({
      packId: corpus,
      setCode: lotterySetId,
      lang: row.lang,
      scope: entry.randomPoolScope,
      existing: entry.randomPoolPrints,
    }),
    enrichSealedPrintLinks({
      packId: corpus,
      lang: row.lang,
      prints: entry.guaranteedPrints,
    }),
  ]);
  // Listed pools often store name=printKey until lookup fills FR/JA titles.
  const enrichedPool = await enrichSealedPrintLinks({
    packId: corpus,
    lang: row.lang,
    prints: rawPool,
  });
  // SKU composition wins over « whole set » — e.g. pochette-fixeez ≠ 108 cards.
  const randomPoolPrints = sealedLotteryPoolForSku(
    enrichedPool,
    entry.packComposition,
  );
  return {
    ...row,
    cardsPerPack: entry.cardsPerPack,
    packsContained: entry.packsContained,
    packsBySet: entry.packsBySet ?? null,
    setCardCount: entry.setCardCount,
    packComposition: entry.packComposition ?? null,
    randomPoolScope: entry.randomPoolScope,
    guaranteedProducts: buildGuaranteedProducts(corpus, entry, bySlug),
    contentsRandom: buildContentsRandom(entry),
    contentsUnits: buildContentsUnits(entry),
    guaranteedPrints,
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
    packComposition: entry.packComposition ?? null,
    randomPoolScope: entry.randomPoolScope,
    guaranteedProducts: buildGuaranteedProducts(corpus, entry, bySlug),
    contentsRandom: buildContentsRandom(entry),
    contentsUnits: buildContentsUnits(entry),
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
    rows = rows.filter((row) => !row.contentsKnown && !row.structureAttested);
  }
  if (input.missingPrice) {
    rows = rows.filter((row) => row.priceCents == null);
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
