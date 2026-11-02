/**
 * Resolve a Placarr printKey to a CardNexus product + EUR finish prices.
 */

import { parsePrintKey } from "@/core/identify/printKey";

import { cardnexusPost } from "./client";
import { loadExpansionIndex, matchExpansionId } from "./expansions";
import { cardnexusGameIdForPrintGame } from "./games";
import {
  centsFromPricesByFinish,
  productSourceUrl,
  type CardnexusPriceCard,
  type CardnexusPricesByFinish,
} from "./prices";

export type CardnexusProductHit = {
  id: number;
  gameId: string;
  name: string;
  printNumber?: string | null;
  expansion?: { id?: number; code?: string; name?: string } | null;
  pricesByFinish?: CardnexusPricesByFinish | null;
};

type SearchPage = { data?: CardnexusProductHit[] };

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
  gameId: string,
  opts?: { signal?: AbortSignal },
): Promise<CardnexusProductHit | null> {
  for (const variant of printNumberSearchVariants(printNumber)) {
    const page = await cardnexusPost<SearchPage>(
      "/products/search",
      { expansionId, printNumber: variant, limit: 20 },
      opts,
    );
    const hits = (page?.data ?? []).filter(
      (p) =>
        p.gameId === gameId && printNumbersMatch(p.printNumber, printNumber),
    );
    if (hits.length === 1) return hits[0]!;
    if (hits.length > 1) {
      // Prefer the hit whose printNumber string equals the variant we asked.
      return (
        hits.find((h) => (h.printNumber ?? "").trim() === variant) ?? hits[0]!
      );
    }
  }
  return null;
}

function toPriceCard(hit: CardnexusProductHit): CardnexusPriceCard | null {
  const { newCents, foilCents } = centsFromPricesByFinish(hit.pricesByFinish);
  if (newCents == null && foilCents == null) return null;
  return {
    id: hit.id,
    name: hit.name,
    gameId: hit.gameId,
    printNumber: hit.printNumber ?? null,
    expansionCode: hit.expansion?.code ?? null,
    sourceUrl: productSourceUrl(hit.id),
    newCents,
    foilCents,
  };
}

/**
 * Look up CardNexus marketplace lows for a printKey.
 * Returns null when the key/game is unsupported, the API key is missing, or
 * no priced product matches.
 */
export async function fetchCardnexusCardForPrintKey(
  printKey: string,
  opts?: { signal?: AbortSignal },
): Promise<CardnexusPriceCard | null> {
  const parsed = parsePrintKey(printKey);
  if (!parsed) return null;
  const gameId = cardnexusGameIdForPrintGame(parsed.game);
  if (!gameId) return null;

  const expansions = await loadExpansionIndex(gameId, opts);
  const expansionId = matchExpansionId(expansions, parsed.set);
  if (expansionId == null) return null;

  const hit = await searchInExpansion(
    expansionId,
    parsed.number,
    gameId,
    opts,
  );
  if (!hit) return null;

  // Search payload usually embeds pricesByFinish; refetch only on miss.
  if (!hit.pricesByFinish) {
    const { cardnexusGet } = await import("./client");
    const full = await cardnexusGet<CardnexusProductHit>(
      `/products/${hit.id}`,
      opts,
    );
    if (!full) return null;
    return toPriceCard(full);
  }
  return toPriceCard(hit);
}
