/**
 * Live listings from narutomythos.com marketplace → EUR `used` offers.
 *
 * API: `GET /api/marketplace/listings?limit=100` (Vinted / eBay / … aggregate).
 * Cards catalogue: `/fr/cards` + `/api/cards` (already documented) — no mint here.
 */
import { pricedOffers } from "@/core/catalog/priceOffers";
import type { PriceOfferInput } from "@/core/enrich/evidence";
import { parsePrintKey } from "@/core/identify/printKey";
import { httpGet } from "@/lib/http/httpClient";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

import { NARUTO_MYTHOS_PRINT_GAME } from "./pack";
import { printKeysForNarutomythosSiteCardId } from "./siteCardId";

export const NARUTOMYTHOS_MARKETPLACE_PRICE_SOURCE = "narutomythos.com";
export const NARUTOMYTHOS_MARKETPLACE_LISTINGS_URL =
  "https://www.narutomythos.com/api/marketplace/listings?limit=100";
export const NARUTOMYTHOS_MARKETPLACE_PAGE_URL =
  "https://www.narutomythos.com/fr/marketplace";

/** Short cache — shelf checklist replays the same dump per printKey. */
export const NARUTOMYTHOS_MARKETPLACE_TTL_MS = 15 * 60 * 1000;

export type NarutomythosMarketplaceListing = {
  id: string;
  cardId: string;
  status?: string;
  condition?: string;
  finish?: string;
  language?: string;
  price: number;
  currency?: string;
  description?: string | null;
  externalUrl?: string | null;
  platform?: string | null;
  card?: {
    id?: string;
    nameEn?: string | null;
    nameFr?: string | null;
  } | null;
  seller?: { name?: string | null } | null;
};

export type NarutomythosMarketplaceQuote = {
  cents: number;
  currency: "EUR";
  offerCount: number;
  productName: string;
  sourceUrl: string;
  listingIds: string[];
};

type ListingsCache = {
  loadedAt: number;
  byPrintKey: Map<string, NarutomythosMarketplaceListing[]>;
};

let listingsCache: ListingsCache | null = null;

export function resetNarutomythosMarketplaceCache(): void {
  listingsCache = null;
}

function printKeyFromCtx(ctx: BarcodePriceRefreshContext): string | null {
  const direct = ctx.printKey?.trim();
  if (direct) return direct;
  return ctx.externalIds?.printKey?.trim() || null;
}

function eurosToCents(price: number): number | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  return Math.round(price * 100);
}

function listingProductName(listing: NarutomythosMarketplaceListing): string {
  const fr = listing.card?.nameFr?.trim();
  if (fr) return fr;
  const en = listing.card?.nameEn?.trim();
  if (en) return en;
  return listing.cardId;
}

function listingSourceUrl(listing: NarutomythosMarketplaceListing): string {
  const external = listing.externalUrl?.trim();
  if (external?.startsWith("http")) return external;
  return NARUTOMYTHOS_MARKETPLACE_PAGE_URL;
}

export function indexNarutomythosMarketplaceListings(
  listings: readonly NarutomythosMarketplaceListing[],
): Map<string, NarutomythosMarketplaceListing[]> {
  const byPrintKey = new Map<string, NarutomythosMarketplaceListing[]>();
  for (const listing of listings) {
    if ((listing.status ?? "ACTIVE").toUpperCase() !== "ACTIVE") continue;
    if ((listing.currency ?? "EUR").toUpperCase() !== "EUR") continue;
    if (eurosToCents(listing.price) == null) continue;
    for (const printKey of printKeysForNarutomythosSiteCardId(listing.cardId)) {
      const bucket = byPrintKey.get(printKey) ?? [];
      bucket.push(listing);
      byPrintKey.set(printKey, bucket);
    }
  }
  return byPrintKey;
}

export function quoteFromNarutomythosListings(
  listings: readonly NarutomythosMarketplaceListing[],
): NarutomythosMarketplaceQuote | null {
  if (!listings.length) return null;
  let best: NarutomythosMarketplaceListing | null = null;
  let bestCents = Number.POSITIVE_INFINITY;
  for (const listing of listings) {
    const cents = eurosToCents(listing.price);
    if (cents == null) continue;
    if (cents < bestCents) {
      bestCents = cents;
      best = listing;
    }
  }
  if (!best || !Number.isFinite(bestCents)) return null;
  return {
    cents: bestCents,
    currency: "EUR",
    offerCount: listings.length,
    productName: listingProductName(best),
    sourceUrl: listingSourceUrl(best),
    listingIds: listings.map((row) => row.id),
  };
}

export function parseNarutomythosMarketplacePayload(
  payload: unknown,
): NarutomythosMarketplaceListing[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return [];
  const listings = (data as { listings?: unknown }).listings;
  if (!Array.isArray(listings)) return [];
  const out: NarutomythosMarketplaceListing[] = [];
  for (const row of listings) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const cardId = typeof r.cardId === "string" ? r.cardId.trim() : "";
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const price = typeof r.price === "number" ? r.price : Number(r.price);
    if (!cardId || !id || !Number.isFinite(price)) continue;
    const cardRaw = r.card;
    let card: NarutomythosMarketplaceListing["card"] = null;
    if (cardRaw && typeof cardRaw === "object") {
      const c = cardRaw as Record<string, unknown>;
      card = {
        id: typeof c.id === "string" ? c.id : undefined,
        nameEn: typeof c.nameEn === "string" ? c.nameEn : null,
        nameFr: typeof c.nameFr === "string" ? c.nameFr : null,
      };
    }
    const sellerRaw = r.seller;
    let seller: NarutomythosMarketplaceListing["seller"] = null;
    if (sellerRaw && typeof sellerRaw === "object") {
      const s = sellerRaw as Record<string, unknown>;
      seller = {
        name: typeof s.name === "string" ? s.name : null,
      };
    }
    out.push({
      id,
      cardId,
      status: typeof r.status === "string" ? r.status : undefined,
      condition: typeof r.condition === "string" ? r.condition : undefined,
      finish: typeof r.finish === "string" ? r.finish : undefined,
      language: typeof r.language === "string" ? r.language : undefined,
      price,
      currency: typeof r.currency === "string" ? r.currency : "EUR",
      description: typeof r.description === "string" ? r.description : null,
      externalUrl: typeof r.externalUrl === "string" ? r.externalUrl : null,
      platform: typeof r.platform === "string" ? r.platform : null,
      card,
      seller,
    });
  }
  return out;
}

export async function loadNarutomythosMarketplaceIndex(options: {
  signal?: AbortSignal;
  evidenceOnly?: boolean;
  now?: Date;
  /** Tests — inject listings without HTTP. */
  listings?: readonly NarutomythosMarketplaceListing[];
} = {}): Promise<Map<string, NarutomythosMarketplaceListing[]>> {
  const nowMs = (options.now ?? new Date()).getTime();
  if (
    listingsCache &&
    nowMs - listingsCache.loadedAt < NARUTOMYTHOS_MARKETPLACE_TTL_MS
  ) {
    return listingsCache.byPrintKey;
  }
  if (options.listings) {
    const byPrintKey = indexNarutomythosMarketplaceListings(options.listings);
    listingsCache = { loadedAt: nowMs, byPrintKey };
    return byPrintKey;
  }
  if (options.evidenceOnly) {
    return listingsCache?.byPrintKey ?? new Map();
  }
  try {
    const res = await httpGet<unknown>(NARUTOMYTHOS_MARKETPLACE_LISTINGS_URL, {
      signal: options.signal,
      timeout: 20_000,
      headers: {
        Accept: "application/json",
      },
    });
    const byPrintKey = indexNarutomythosMarketplaceListings(
      parseNarutomythosMarketplacePayload(res.data),
    );
    listingsCache = { loadedAt: nowMs, byPrintKey };
    return byPrintKey;
  } catch {
    return listingsCache?.byPrintKey ?? new Map();
  }
}

export async function refreshNarutomythosMarketplacePriceOffers(
  ctx: BarcodePriceRefreshContext,
): Promise<PriceOfferInput[]> {
  if (ctx.shelfType !== "tcg") return [];
  const printKey = printKeyFromCtx(ctx);
  if (!printKey) return [];
  if (parsePrintKey(printKey)?.game !== NARUTO_MYTHOS_PRINT_GAME) return [];

  const index = await loadNarutomythosMarketplaceIndex({
    signal: ctx.signal,
    evidenceOnly: Boolean(ctx.evidenceOnly),
  });
  const listings = index.get(printKey) ?? [];
  const quote = quoteFromNarutomythosListings(listings);
  if (!quote) return [];

  const productName =
    ctx.primaryTitle?.trim() ||
    ctx.primaryName?.trim() ||
    ctx.titles?.[0]?.trim() ||
    quote.productName;

  return pricedOffers(NARUTOMYTHOS_MARKETPLACE_PRICE_SOURCE, [
    {
      condition: "used",
      priceCents: quote.cents,
      rawValue: quote,
      extra: {
        currency: quote.currency,
        productName,
        sourceUrl: quote.sourceUrl,
        offerCount: quote.offerCount,
        metadataScoped: true,
      },
    },
  ]);
}
