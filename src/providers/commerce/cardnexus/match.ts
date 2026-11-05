/**
 * Resolve a Placarr printKey to a CardNexus product (prices, image, SKUs).
 */

import { parsePrintKey } from "@/core/identify/printKey";

import { cardnexusGet, cardnexusPost } from "./client";
import { loadExpansionIndex, matchExpansionId } from "./expansions";
import {
  cardnexusGameIdsForPrint,
  type CardnexusGameId,
} from "./games";
import {
  centsFromPricesByFinish,
  productSourceUrl,
  type CardnexusExternalIds,
  type CardnexusPriceCard,
  type CardnexusPricesByFinish,
} from "./prices";

export type CardnexusProductHit = {
  id: number;
  gameId: string;
  name: string;
  printNumber?: string | null;
  imageUrl?: string | null;
  productType?: string | null;
  productCategory?: string | null;
  expansion?: { id?: number; code?: string; name?: string } | null;
  pricesByFinish?: CardnexusPricesByFinish | null;
  externalIds?: CardnexusExternalIds | null;
};

type SearchPage = { data?: CardnexusProductHit[] };

export type FetchCardnexusOpts = {
  signal?: AbortSignal;
  /** Prefer JA / OCG catalogues when `ja`. */
  language?: string | null;
  /**
   * When false, return the matched product even without EUR lows
   * (faces / SKU harvest). Default true for price refresh.
   */
  requirePrices?: boolean;
};

/** Normalize collector numbers so `001` ≡ `1` and case drops out. */
export function printNumbersMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = (a ?? "").trim().toLowerCase();
  const right = (b ?? "").trim().toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  const strip = (s: string) => {
    const m = /^0*(\d+)(.*)$/.exec(s);
    return m ? `${m[1]}${m[2]}` : s;
  };
  return strip(left) === strip(right);
}

function printNumberSearchVariants(number: string): string[] {
  const raw = number.trim();
  if (!raw) return [];
  const out = [raw];
  if (/^\d+$/.test(raw)) {
    const asInt = String(Number.parseInt(raw, 10));
    if (asInt !== raw) out.push(asInt);
    const pad3 = raw.padStart(3, "0");
    if (pad3 !== raw) out.push(pad3);
  }
  return [...new Set(out)];
}

async function searchInExpansion(
  expansionId: number,
  printNumber: string,
  gameId: CardnexusGameId,
  opts?: { signal?: AbortSignal },
): Promise<CardnexusProductHit | null> {
  for (const variant of printNumberSearchVariants(printNumber)) {
    const page = await cardnexusPost<SearchPage>(
      "/products/search",
      {
        expansionId: [expansionId],
        printNumber: variant,
        productType: { op: "or", values: ["card"] },
        gameFilters: { game: gameId },
        limit: 20,
      },
      opts,
    );
    const hits = (page?.data ?? []).filter(
      (p) =>
        p.gameId === gameId && printNumbersMatch(p.printNumber, printNumber),
    );
    if (hits.length === 1) return hits[0]!;
    if (hits.length > 1) {
      return (
        hits.find((h) => (h.printNumber ?? "").trim() === variant) ?? hits[0]!
      );
    }
  }
  return null;
}

function toPriceCard(
  hit: CardnexusProductHit,
  opts?: { requirePrices?: boolean },
): CardnexusPriceCard | null {
  const { newCents, foilCents } = centsFromPricesByFinish(hit.pricesByFinish);
  const requirePrices = opts?.requirePrices !== false;
  if (requirePrices && newCents == null && foilCents == null) return null;
  return {
    id: hit.id,
    name: hit.name,
    gameId: hit.gameId,
    printNumber: hit.printNumber ?? null,
    expansionCode: hit.expansion?.code ?? null,
    sourceUrl: productSourceUrl(hit.id),
    newCents,
    foilCents,
    imageUrl: hit.imageUrl?.trim() || null,
    productType: hit.productType ?? "card",
    productCategory: hit.productCategory ?? null,
    externalIds: hit.externalIds ?? null,
  };
}

async function resolveHit(
  hit: CardnexusProductHit,
  opts?: FetchCardnexusOpts,
): Promise<CardnexusProductHit | null> {
  if (hit.pricesByFinish && hit.imageUrl) return hit;
  const full = await cardnexusGet<CardnexusProductHit>(
    `/products/${hit.id}`,
    opts,
  );
  return full ?? hit;
}

/**
 * Look up a CardNexus catalogue product for a printKey (card only).
 * Tries locale-aware game catalogues until an expansion + printNumber match.
 */
export async function fetchCardnexusProductForPrintKey(
  printKey: string,
  opts?: FetchCardnexusOpts,
): Promise<CardnexusProductHit | null> {
  const parsed = parsePrintKey(printKey);
  if (!parsed) return null;
  const gameIds = cardnexusGameIdsForPrint({
    printGame: parsed.game,
    language: opts?.language,
  });
  if (gameIds.length === 0) return null;

  for (const gameId of gameIds) {
    const expansions = await loadExpansionIndex(gameId, opts);
    const expansionId = matchExpansionId(expansions, parsed.set);
    if (expansionId == null) continue;

    const hit = await searchInExpansion(
      expansionId,
      parsed.number,
      gameId,
      opts,
    );
    if (!hit) continue;
    return resolveHit(hit, opts);
  }
  return null;
}

/**
 * Look up CardNexus marketplace lows for a printKey.
 * Returns null when the key/game is unsupported, the API key is missing, or
 * no priced product matches (unless {@link FetchCardnexusOpts.requirePrices}
 * is false — then image/SKU-only hits are kept).
 */
export async function fetchCardnexusCardForPrintKey(
  printKey: string,
  opts?: FetchCardnexusOpts,
): Promise<CardnexusPriceCard | null> {
  const hit = await fetchCardnexusProductForPrintKey(printKey, opts);
  if (!hit) return null;
  return toPriceCard(hit, { requirePrices: opts?.requirePrices });
}
