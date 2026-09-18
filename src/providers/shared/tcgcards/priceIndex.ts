/**
 * Cardmarket EUR cotes from dbscards / fw.dbscards list tiles → printKey index.
 *
 * Masters SKUs carry the parallel as a rarity suffix (`BT1-011-SPR`). Fusion
 * World alt arts share the base SKU and encode the parallel in the slug
 * (`…-plus-alt-art…` → `p1`, `…-plus-plus…` → `p2`). SPR dumps never also
 * carry a PR tile for the same ref, while Bandai's cardlist sometimes files
 * that printing as `_PR` — so SPR prices can be aliased under `-pr` as well
 * (`aliasSprAsPr`).
 */
import { buildPrintKey, parsePrintKey } from "@/core/identify/printKey";

import { dbscardsBareSlug, dbscardsPrintRef, type DbscardsTile } from "./tile";

export type DbscardsPriceCard = {
  printKey: string;
  name: string;
  priceCents: number;
  currency: string;
  sourceUrl: string | null;
  lang: string | null;
};

export type DbscardsPriceIndex = Record<string, DbscardsPriceCard>;

/** Bandai parallel codes that become printKey grouping (not plain rarity). */
export function dbscardsGroupingFromSkuSuffix(
  suffix: string | null | undefined,
): string | null {
  const s = suffix?.trim().toLowerCase();
  if (!s) return null;
  if (s === "spr" || s === "gdr") return s;
  if (/^pr\d*$/.test(s)) return s;
  if (/^p\d+$/.test(s)) return s;
  return null;
}

/**
 * Fusion World parallel level from the tile slug (`p1` / `p2`).
 * Base cards (no plus / alt-art) return null.
 */
export function dbscardsFwParallelFromSlug(
  slug: string | null | undefined,
): string | null {
  if (!slug?.trim()) return null;
  const bare = dbscardsBareSlug(slug);
  if (/plus-plus/i.test(bare)) return "p2";
  if (/-plus-|alt-art/i.test(bare)) return "p1";
  return null;
}

function skuGroupingSuffix(sku: string | null | undefined): string | null {
  const match = /^[a-z0-9]+-\d+[a-z]*-([a-z0-9]+)$/i.exec(sku ?? "");
  return match?.[1] ?? null;
}

/**
 * Collector fullRef for a priced tile: `bt1-011-spr`, `st01-001-p1`, or base
 * `bt31-001`.
 */
export function dbscardsPriceFullRef(
  tile: Pick<DbscardsTile, "sku" | "slug" | "ref">,
): string | null {
  const base = (tile.ref?.trim() || dbscardsPrintRef(tile) || "").toLowerCase();
  if (!base) return null;

  const fromSku = dbscardsGroupingFromSkuSuffix(skuGroupingSuffix(tile.sku));
  if (fromSku) return `${base}-${fromSku}`;

  const fromSlug = dbscardsFwParallelFromSlug(tile.slug);
  if (fromSlug) return `${base}-${fromSlug}`;

  return base;
}

function langScore(lang: string | null | undefined): number {
  const l = (lang ?? "").trim().toLowerCase();
  if (l === "fr") return 3;
  if (l === "en") return 2;
  if (l === "ja" || l === "jp") return 1;
  return 0;
}

function euroToCents(price: number | null | undefined): number | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return null;
  }
  return Math.round(price * 100);
}

function cardUrl(origin: string, slug: string): string | null {
  const trimmed = slug.trim().replace(/^\/+/, "");
  if (!trimmed) return null;
  return `${origin.replace(/\/+$/, "")}/cards/${trimmed}`;
}

function putCard(
  index: DbscardsPriceIndex,
  printKey: string,
  card: DbscardsPriceCard,
): void {
  const prev = index[printKey];
  if (!prev) {
    index[printKey] = card;
    return;
  }
  if (langScore(card.lang) > langScore(prev.lang)) {
    index[printKey] = card;
  }
}

function parsePriceIdentity(
  game: string,
  fullRef: string,
): { game: string; set: string; number: string; grouping: string | null } | null {
  const match = /^([a-z0-9]+)-(\d+[a-z]*)(?:-(.+))?$/i.exec(fullRef.trim());
  if (!match) return null;
  return {
    game,
    set: match[1]!.toLowerCase(),
    number: match[2]!.toLowerCase(),
    grouping: match[3] ? match[3].toLowerCase() : null,
  };
}

/**
 * Build a printKey → price map from one site's list dump.
 * Skips tiles without a positive EUR price.
 */
export function priceIndexFromDbscardsTiles(
  tiles: readonly DbscardsTile[],
  opts: {
    /** PrintKey game slug for this pack (caller-owned). */
    game: string;
    origin: string;
    /**
     * When true, also index SPR tiles under `-pr` (Bandai often files that
     * printing as `_PR` while the dump labels rarity SPR).
     */
    aliasSprAsPr?: boolean;
  },
): DbscardsPriceIndex {
  const index: DbscardsPriceIndex = {};
  for (const tile of tiles) {
    const cents = euroToCents(tile.price);
    if (cents == null) continue;
    const fullRef = dbscardsPriceFullRef(tile);
    if (!fullRef) continue;
    const identity = parsePriceIdentity(opts.game, fullRef);
    if (!identity) continue;
    const key = buildPrintKey(identity);
    if (!key) continue;

    const card: DbscardsPriceCard = {
      printKey: key,
      name: tile.name.trim() || key,
      priceCents: cents,
      currency: (tile.currency?.trim() || "EUR").toUpperCase(),
      sourceUrl: cardUrl(opts.origin, tile.slug),
      lang: tile.lang,
    };
    putCard(index, key, card);

    if (opts.aliasSprAsPr && identity.grouping === "spr") {
      const prKey = buildPrintKey({ ...identity, grouping: "pr" });
      if (prKey) putCard(index, prKey, { ...card, printKey: prKey });
    }
  }
  return index;
}

/** Merge several pack indexes (later packs do not overwrite better lang). */
export function mergeDbscardsPriceIndexes(
  ...indexes: readonly DbscardsPriceIndex[]
): DbscardsPriceIndex {
  const out: DbscardsPriceIndex = {};
  for (const index of indexes) {
    for (const [key, card] of Object.entries(index)) {
      putCard(out, key, card);
    }
  }
  return out;
}

export function lookupDbscardsPrice(
  index: DbscardsPriceIndex,
  printKey: string,
): DbscardsPriceCard | null {
  const direct = index[printKey];
  if (direct) return direct;

  // Exact miss on `-pr` → try `-spr` (and the reverse) when only one was indexed.
  const identity = parsePrintKey(printKey);
  if (!identity?.grouping) return null;
  if (identity.grouping === "pr") {
    const spr = buildPrintKey({ ...identity, grouping: "spr" });
    return spr ? (index[spr] ?? null) : null;
  }
  if (identity.grouping === "spr") {
    const pr = buildPrintKey({ ...identity, grouping: "pr" });
    return pr ? (index[pr] ?? null) : null;
  }
  return null;
}
