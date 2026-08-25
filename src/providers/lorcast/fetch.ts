/**
 * Lorcast — Disney Lorcana card data with TCGplayer market prices (USD).
 * Free public API, English prints. Match by printKey set/number.
 */
import { httpGet } from "@/lib/http/httpClient";
import { parsePrintKey } from "@/core/identify/printKey";
import { lorcanaPromoSetFromGrouping } from "@/providers/shared/lorcanaPromoSet";

/** Alias — une seule implémentation dans `shared/lorcanaPromoSet`. */
export const lorcastPromoSetFromGrouping = lorcanaPromoSetFromGrouping;

const BASE_URL = "https://api.lorcast.com/v0";
const LORCANA_GAME = "lorcana";

export type LorcastCardPrices = {
  usd: number | null;
  usdFoil: number | null;
};

export type LorcastCard = {
  id: string;
  name: string;
  version: string | null;
  collectorNumber: string;
  setCode: string;
  tcgplayerId: number | null;
  prices: LorcastCardPrices;
};

type RawLorcastCard = {
  id?: unknown;
  name?: unknown;
  version?: unknown;
  collector_number?: unknown;
  tcgplayer_id?: unknown;
  set?: { code?: unknown; id?: unknown; name?: unknown };
  prices?: { usd?: unknown; usd_foil?: unknown };
};

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function usdToCents(value: unknown): number | null {
  const dollars = numberOrNull(value);
  if (dollars == null || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

export function mapLorcastCard(raw: RawLorcastCard): LorcastCard | null {
  const id = text(raw.id);
  const name = text(raw.name);
  const collectorNumber = text(raw.collector_number);
  const setCode = text(raw.set?.code);
  if (!id || !name || !collectorNumber || !setCode) return null;
  return {
    id,
    name,
    version: text(raw.version),
    collectorNumber,
    setCode,
    tcgplayerId: numberOrNull(raw.tcgplayer_id),
    prices: {
      usd: usdToCents(raw.prices?.usd),
      usdFoil: usdToCents(raw.prices?.usd_foil),
    },
  };
}

export function lorcastProductUrl(card: LorcastCard): string {
  if (card.tcgplayerId != null) {
    return `https://www.tcgplayer.com/product/${card.tcgplayerId}`;
  }
  return `https://lorcast.com/cards/${card.setCode}/${card.collectorNumber}`;
}

export function lorcastCardLabel(card: LorcastCard): string {
  return card.version ? `${card.name} - ${card.version}` : card.name;
}

/**
 * Resolve Lorcast path segments from a Placarr printKey.
 * `lorcana:1-20` → set `1`, number `20`
 * `lorcana:3-4a` → set `3`, number `4a`
 * `lorcana:1-20-p1` → try `20p1` then search fallbacks in the caller
 */
export function lorcastLookupFromPrintKey(
  printKey: string | null | undefined,
): {
  set: string;
  number: string;
  grouping: string | null;
} | null {
  const identity = parsePrintKey(printKey);
  if (!identity || identity.game !== LORCANA_GAME) return null;
  return {
    set: identity.set,
    number: identity.number,
    grouping: identity.grouping ?? null,
  };
}

export async function fetchLorcastCardBySetNumber(
  set: string,
  number: string,
  options: { signal?: AbortSignal } = {},
): Promise<LorcastCard | null> {
  const setCode = set.trim();
  const collector = number.trim();
  if (!setCode || !collector) return null;
  try {
    const response = await httpGet<RawLorcastCard>(
      `${BASE_URL}/cards/${encodeURIComponent(setCode)}/${encodeURIComponent(collector)}`,
      { signal: options.signal, timeout: 15_000 },
    );
    if (response.status === 404 || !response.data) return null;
    return mapLorcastCard(response.data);
  } catch {
    return null;
  }
}

export async function searchLorcastCards(
  query: string,
  options: { signal?: AbortSignal; unique?: "cards" | "prints" } = {},
): Promise<LorcastCard[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const params = new URLSearchParams({ q });
    if (options.unique) params.set("unique", options.unique);
    const response = await httpGet<{ results?: RawLorcastCard[] }>(
      `${BASE_URL}/cards/search?${params}`,
      { signal: options.signal, timeout: 15_000 },
    );
    const results = Array.isArray(response.data?.results)
      ? response.data.results
      : [];
    return results
      .map((row) => mapLorcastCard(row))
      .filter((card): card is LorcastCard => card != null);
  } catch {
    return [];
  }
}

/**
 * Lorcast indexes set promos under set codes `P1`/`P2`/… (collector number
 * only), not under the main set with a `-pN` suffix. Placarr printKeys keep
 * the printed identity (`lorcana:7-24b-p2`); this maps via
 * `lorcastPromoSetFromGrouping`.
 */

function collectorNumberCandidates(number: string): string[] {
  const raw = number.trim();
  if (!raw) return [];
  const upper = raw.toUpperCase();
  const digits = raw.replace(/[a-z]+$/i, "");
  return [
    ...new Set([raw, upper, ...(digits && digits !== raw ? [digits] : [])]),
  ];
}

function preferPricedLorcastCard(
  cards: Array<LorcastCard | null | undefined>,
): LorcastCard | null {
  const found = cards.filter((card): card is LorcastCard => card != null);
  if (found.length === 0) return null;
  return (
    found.find(
      (card) => card.prices.usd != null || card.prices.usdFoil != null,
    ) ?? found[0]
  );
}

function pickLorcastSearchMatch(
  results: LorcastCard[],
  lookup: { set: string; number: string; grouping: string | null },
  promoSet: string | null,
): LorcastCard | null {
  const wanted = lookup.number.toLowerCase();
  const wantedDigits = wanted.replace(/[a-z]+$/g, "");

  const inPromoSet = promoSet
    ? results.filter(
        (card) => card.setCode.toUpperCase() === promoSet.toUpperCase(),
      )
    : [];
  const inMainSet = results.filter(
    (card) => card.setCode.toLowerCase() === lookup.set.toLowerCase(),
  );

  const numberMatch = (card: LorcastCard) => {
    const collector = card.collectorNumber.toLowerCase();
    return (
      collector === wanted ||
      (wantedDigits.length > 0 && collector === wantedDigits)
    );
  };

  if (promoSet) {
    const exact = preferPricedLorcastCard(inPromoSet.filter(numberMatch));
    if (exact) return exact;
    // Promo set hit without a stable collector match (title search only).
    const anyPromo = preferPricedLorcastCard(inPromoSet);
    if (anyPromo) return anyPromo;
  }

  if (!lookup.grouping) {
    return preferPricedLorcastCard(inMainSet.filter(numberMatch));
  }

  return null;
}

/**
 * Preferred lookup: printKey → `/cards/{set}/{number}`.
 * Promo groupings resolve via Lorcast promo sets (`P2/24`), then title search.
 */
export async function fetchLorcastCardForPrintKey(
  printKey: string | null | undefined,
  options: { signal?: AbortSignal; titleHint?: string | null } = {},
): Promise<LorcastCard | null> {
  const lookup = lorcastLookupFromPrintKey(printKey);
  if (!lookup) return null;

  const direct = await fetchLorcastCardBySetNumber(
    lookup.set,
    lookup.number,
    options,
  );
  if (direct && !lookup.grouping) return direct;

  const promoSet = lorcastPromoSetFromGrouping(lookup.grouping);
  if (promoSet) {
    const promoHits: Array<LorcastCard | null> = [];
    for (const number of collectorNumberCandidates(lookup.number)) {
      promoHits.push(
        await fetchLorcastCardBySetNumber(promoSet, number, options),
      );
    }
    const promo = preferPricedLorcastCard(promoHits);
    if (promo) return promo;
  }

  if (lookup.grouping) {
    const combined = await fetchLorcastCardBySetNumber(
      lookup.set,
      `${lookup.number}${lookup.grouping}`,
      options,
    );
    if (combined) return combined;
  }

  const hint = options.titleHint?.trim();
  if (!hint) return lookup.grouping ? null : direct;

  const queries = promoSet
    ? [`${hint} set:${promoSet}`, `${hint} set:${lookup.set}`, hint]
    : [`${hint} set:${lookup.set}`, hint];

  for (const query of queries) {
    const results = await searchLorcastCards(query, {
      ...options,
      unique: "prints",
    });
    const match = pickLorcastSearchMatch(results, lookup, promoSet);
    if (match) return match;
  }

  return lookup.grouping ? null : direct;
}
