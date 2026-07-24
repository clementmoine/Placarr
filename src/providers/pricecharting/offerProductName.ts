import type { NormalizablePriceOffer } from "@/providers/ebay/normalizeLegacyPriceOffer";

const PRICECHARTING_GAME_URL =
  /(?:^|\.)pricecharting\.com\/game\/[^/?#]+\/([^/?#]+)/i;

/**
 * Derive a human title from a PriceCharting `/game/{platform}/{slug}` URL so
 * unnamed catalog price rows can still be title-aligned on read.
 */
export function productNameFromPriceChartingGameUrl(
  url?: string | null,
): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    const href = raw.includes("://") ? raw : `https://${raw}`;
    const path = new URL(href).pathname;
    const match = path.match(/\/game\/[^/]+\/([^/]+)/i);
    if (!match?.[1]) return null;
    const slug = decodeURIComponent(match[1]).replace(/\+/g, " ").trim();
    if (!slug) return null;
    return slug.replace(/-/g, " ").replace(/\s+/g, " ").trim() || null;
  } catch {
    const match = raw.match(PRICECHARTING_GAME_URL);
    if (!match?.[1]) return null;
    return (
      decodeURIComponent(match[1])
        .replace(/-/g, " ")
        .replace(/\s+/g, " ")
        .trim() || null
    );
  }
}

/** Fill `productName` on PriceCharting rows that only stored a sourceUrl. */
export function enrichPriceChartingOfferProductName<
  T extends NormalizablePriceOffer,
>(offer: T): T {
  if (offer.productName?.trim()) return offer;
  const fromUrl = productNameFromPriceChartingGameUrl(offer.sourceUrl);
  if (!fromUrl) return offer;
  return { ...offer, productName: fromUrl };
}
