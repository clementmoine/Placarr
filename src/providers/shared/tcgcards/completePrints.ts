/**
 * Complete a product's `containsPrints` from the local Bandai catalogue.
 *
 * dbscards' product fiche renders « cartes incluses » as a preview: measured
 * 2026-08-16, that grid is **15 tiles** even when `Contenu → Nombre de cartes`
 * is 19 (SD23) or 56 (EX24). Their `/series/{slug}` page raises the first-page
 * cap to 30, but `?page=2` is JS-only — a GET returns page 1 again. Chasing
 * that host for the rest of the list would be more requests against a tarpit
 * for a list Bandai already gave us.
 *
 * Each Bandai series lands in `catalog.sqlite` as `print_titles.set_name`.
 * A starter's series is the known list (SD23 = 19, FS01 = 23). A booster
 * series is the random pool (BT23 ≈ 157) — that is not « this SKU contains
 * these cards ». We join the product to a series by the code in its slug
 * (or the fiche `Série` when that code is not a booster set), and we refuse
 * a series of 100+ prints: every booster series in both local catalogues is
 * ≥ 119, every deck / exclusive-box series is ≤ 77.
 *
 * The 15 preview tiles are kept and unioned: older decks list reprints on
 * the fiche that Bandai filed under the original set, not the deck series.
 */
import { parsePrintKey } from "@/core/identify/printKey";

import type {
  DbscardsProductPage,
  DbscardsProductPrintLink,
} from "./parseProducts";
import { tcgCardsCategoryRole } from "./sites";

/**
 * Smallest Bandai booster series in the local catalogues is 119 (Masters
 * Galactic Battle). Largest exclusive-box series is 77 (GE02). 100 sits
 * in the gap — a measured cut, not a guess.
 */
export const DBSCARDS_BOOSTER_SERIES_MIN = 100;

/** EX23 is 59 in catalogue vs 58 declared; GE02 is 77 vs 85. */
export const DBSCARDS_DECLARED_SLACK = 10;

export type DbscardsCatalogPrint = {
  printKey: string;
  setCode: string;
  setName: string;
  name: string;
  /** Collector ref without grouping: `fs10-01`. */
  ref: string;
  /** `fs10-01-p1` when Bandai filed a parallel; otherwise `ref`. */
  fullRef: string;
  grouping: string | null;
};

export type DbscardsCatalogIndex = {
  /** `set_code` lowercased → prints that carry it. */
  bySetCode: Map<string, DbscardsCatalogPrint[]>;
  /** `set_name` → every print Bandai filed under that series. */
  bySetName: Map<string, DbscardsCatalogPrint[]>;
};

export function catalogRefFromPrintKey(printKey: string): string | null {
  const identity = parsePrintKey(printKey);
  if (!identity) return null;
  return `${identity.set}-${identity.number}`;
}

export function catalogFullRefFromPrintKey(printKey: string): string | null {
  const identity = parsePrintKey(printKey);
  if (!identity) return null;
  return identity.grouping
    ? `${identity.set}-${identity.number}-${identity.grouping}`
    : `${identity.set}-${identity.number}`;
}

/**
 * Codes a product might own: `sd23` from the slug, `ex24` from the fiche
 * `Série`. `gc-02` becomes `gc02`. Booster codes on the fiche (`BT18` on
 * SD17–SD20) are ignored — dbscards tags those decks with the contemporaneous
 * set, which is not their series.
 */
export function extractProductSeriesCodes(
  slug: string,
  setCode?: string | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const code = raw.trim().toLowerCase();
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push(code);
  };
  const compact = slug.toLowerCase();
  for (const match of compact.matchAll(/(?:^|-)([a-z]+\d+)(?=-|$)/g)) {
    add(match[1]!);
  }
  for (const match of compact.matchAll(/(?:^|-)([a-z]{1,2})-(\d+)(?=-|$)/g)) {
    add(`${match[1]}${match[2]}`);
  }
  const fromFiche = setCode?.trim().toLowerCase().replace(/\s+/g, "") ?? "";
  if (fromFiche && !/^(bt|fb)\d+$/i.test(fromFiche)) add(fromFiche);
  return out;
}

export function setCodeVariants(code: string): string[] {
  const lower = code.trim().toLowerCase();
  const match = /^([a-z]+)(\d+)$/.exec(lower);
  if (!match) return [lower];
  const letters = match[1]!;
  const n = Number.parseInt(match[2]!, 10);
  return [
    ...new Set([
      lower,
      `${letters}${n}`,
      `${letters}${String(n).padStart(2, "0")}`,
    ]),
  ];
}

function seriesSizeOk(size: number, declared: number | null): boolean {
  if (size >= DBSCARDS_BOOSTER_SERIES_MIN) return false;
  if (declared != null && size > declared + DBSCARDS_DECLARED_SLACK) {
    return false;
  }
  return size > 0;
}

function pluralitySetName(
  prints: readonly DbscardsCatalogPrint[],
): string | null {
  const counts = new Map<string, number>();
  for (const print of prints) {
    counts.set(print.setName, (counts.get(print.setName) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [name, n] of counts) {
    if (n > bestN) {
      best = name;
      bestN = n;
    }
  }
  return best;
}

function setNamesContainingCode(
  catalog: DbscardsCatalogIndex,
  code: string,
): string[] {
  const variants = setCodeVariants(code);
  const hits: string[] = [];
  for (const name of catalog.bySetName.keys()) {
    const hay = name.toLowerCase();
    if (
      variants.some((variant) =>
        new RegExp(`(?:^|[^a-z0-9])${variant}(?:[^a-z0-9]|$)`, "i").test(hay),
      )
    ) {
      hits.push(name);
    }
  }
  return hits;
}

/** Function words only — not product taxonomy. */
const TITLE_STOP = new Set([
  "de",
  "la",
  "le",
  "les",
  "the",
  "et",
  "of",
  "a",
  "and",
  "un",
  "une",
  "du",
  "des",
  "d",
  "l",
]);

export function titleTokens(value: string): Set<string> {
  const folded = value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const out = new Set<string>();
  for (const token of folded.split(/[^a-z0-9]+/)) {
    if (token.length < 2 || TITLE_STOP.has(token)) continue;
    out.add(token);
  }
  return out;
}

/**
 * Bandai series whose every token appears in the product name/slug.
 * "Special Anniversary Box 2021" ⊂ "special-anniversary-box-2021-vegeta".
 * Needs ≥ 3 tokens so a short label cannot swallow a booster series.
 */
export function resolveSeriesByTitle(
  product: Pick<DbscardsProductPage, "slug" | "name" | "declaredCardCount">,
  catalog: DbscardsCatalogIndex,
): { setName: string; prints: DbscardsCatalogPrint[] } | null {
  const hay = titleTokens(`${product.slug} ${product.name ?? ""}`);
  const hits: Array<{
    setName: string;
    prints: DbscardsCatalogPrint[];
    tokens: number;
  }> = [];
  for (const [setName, prints] of catalog.bySetName) {
    const tokens = titleTokens(setName);
    if (tokens.size < 3) continue;
    if (![...tokens].every((token) => hay.has(token))) continue;
    if (!seriesSizeOk(prints.length, product.declaredCardCount)) continue;
    hits.push({ setName, prints, tokens: tokens.size });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => b.tokens - a.tokens || b.prints.length - a.prints.length);
  const top = hits[0]!;
  return { setName: top.setName, prints: top.prints };
}

export function resolveProductCatalogSeries(
  product: Pick<
    DbscardsProductPage,
    "slug" | "name" | "setCode" | "declaredCardCount"
  >,
  catalog: DbscardsCatalogIndex,
): { setName: string; prints: DbscardsCatalogPrint[] } | null {
  const codes = extractProductSeriesCodes(product.slug, product.setCode);
  const declared = product.declaredCardCount;
  let fallback: { setName: string; prints: DbscardsCatalogPrint[] } | null =
    null;

  const consider = (setName: string, prefix: boolean) => {
    const prints = catalog.bySetName.get(setName);
    if (!prints || !seriesSizeOk(prints.length, declared)) return;
    const hit = { setName, prints };
    if (prefix) return hit;
    fallback ??= hit;
    return null;
  };

  for (const code of codes) {
    const prefix = setCodeVariants(code).some(
      (variant) =>
        product.slug === variant || product.slug.startsWith(`${variant}-`),
    );
    const bundled: DbscardsCatalogPrint[] = [];
    for (const variant of setCodeVariants(code)) {
      const rows = catalog.bySetCode.get(variant);
      if (rows) bundled.push(...rows);
    }
    if (bundled.length > 0) {
      const setName = pluralitySetName(bundled);
      if (setName) {
        const prefixHit = consider(setName, prefix);
        if (prefixHit) return prefixHit;
      }
    }
    const named = setNamesContainingCode(catalog, code);
    if (named.length === 1) {
      const prefixHit = consider(named[0]!, prefix);
      if (prefixHit) return prefixHit;
    }
  }
  return fallback ?? resolveSeriesByTitle(product, catalog);
}

export function catalogPrintToLink(
  print: DbscardsCatalogPrint,
): DbscardsProductPrintLink {
  return {
    slug: print.fullRef,
    path: `/cards/${print.fullRef}`,
    ref: print.fullRef,
    sku: null,
    name: print.name,
  };
}

/**
 * The Bandai series is the list. Tiles overlay their real dbscards slug on
 * the matching base print. A tile whose ref is not in the series at all
 * (a reprint Bandai filed under the original set) is kept. Parallels
 * (`-p1`) stay distinct — Fusion World starters declare 36 cards as 18×2.
 * A lone `-pr` reprint in a Masters deck is the same collector card the
 * tile already shows, so it reuses the tile.
 */
export function unionContainsPrints(
  tiles: readonly DbscardsProductPrintLink[],
  catalogPrints: readonly DbscardsCatalogPrint[],
): DbscardsProductPrintLink[] {
  const byBase = new Map<string, DbscardsCatalogPrint[]>();
  for (const print of catalogPrints) {
    const bucket = byBase.get(print.ref);
    if (bucket) bucket.push(print);
    else byBase.set(print.ref, [print]);
  }
  const tileByRef = new Map<string, DbscardsProductPrintLink>();
  for (const tile of tiles) {
    const key = tile.ref?.toLowerCase();
    if (key && !tileByRef.has(key)) tileByRef.set(key, tile);
  }

  const seen = new Set<string>();
  const out: DbscardsProductPrintLink[] = [];
  const push = (link: DbscardsProductPrintLink) => {
    const key = (link.ref ?? link.slug).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(link);
  };

  for (const tile of tiles) {
    const key = tile.ref?.toLowerCase();
    if (key && !byBase.has(key)) push(tile);
  }
  for (const print of catalogPrints) {
    const tile = tileByRef.get(print.ref);
    const siblings = byBase.get(print.ref) ?? [print];
    if (tile && (!print.grouping || siblings.length === 1)) {
      push(tile);
      continue;
    }
    push(catalogPrintToLink(print));
  }
  return out;
}

export function completeProductContainsPrints(
  product: DbscardsProductPage,
  catalog: DbscardsCatalogIndex | null,
  lookup?: (ref: string) => Partial<DbscardsProductPrintLink> | null,
): DbscardsProductPage {
  if (!catalog) return product;
  // A booster fiche's 15 tiles are a labelled preview of the pool. Theme
  // boosters (EB1 = 72, TB02 = 77) sit under the 100-print cut, so the
  // size guard alone would dump the series into the pack.
  if (tcgCardsCategoryRole(product.category) === "preview") {
    return product;
  }
  const series = resolveProductCatalogSeries(product, catalog);
  if (!series) return product;
  const merged = unionContainsPrints(product.containsPrints, series.prints);
  const withSlugs = lookup
    ? merged.map((link) => {
        if (link.path.startsWith("/cards/") && link.sku) return link;
        const extra = lookup(link.ref ?? link.slug);
        if (!extra) return link;
        return {
          ...link,
          slug: extra.slug ?? link.slug,
          path: extra.path ?? link.path,
          sku: extra.sku ?? link.sku,
          name: link.name || extra.name || "",
        };
      })
    : merged;
  const declared = product.declaredCardCount;
  return {
    ...product,
    containsPrints: withSlugs,
    containsPrintsIsPreview: declared != null && withSlugs.length < declared,
  };
}
