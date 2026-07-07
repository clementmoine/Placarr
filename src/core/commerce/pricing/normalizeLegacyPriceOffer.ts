import { getEbayMarketplaceId } from "@/providers/ebay/env";

/** Legacy price rows stored before the PicClick provider was removed (2026-07). */
const LEGACY_PICCLICK_SOURCE = /^picclick$/i;

export type NormalizablePriceOffer = {
  source: string;
  productName?: string | null;
  merchantName?: string | null;
  condition?: string | null;
  priceCents: number;
  currency?: string | null;
  shippingCents?: number | null;
  totalCents?: number | null;
  sourceUrl?: string | null;
  availability?: string | null;
  offerCount?: number | null;
  rawValue?: unknown;
  observedAt?: Date | string | null;
};

export function isLegacyPicClickPriceSource(
  source: string | null | undefined,
): boolean {
  return !!source?.trim() && LEGACY_PICCLICK_SOURCE.test(source.trim());
}

function picClickUrlInValue(value: string | null | undefined): boolean {
  return !!value?.trim() && /picclick\./i.test(value);
}

export function needsLegacyPriceOfferNormalization(
  offer: NormalizablePriceOffer,
): boolean {
  if (!legacyPicClickPayload(offer)) return false;
  const normalized = normalizeLegacyPriceOffer(offer);
  return (
    normalized.source !== offer.source ||
    normalized.sourceUrl !== offer.sourceUrl ||
    JSON.stringify(normalized.rawValue ?? null) !==
      JSON.stringify(offer.rawValue ?? null)
  );
}

function legacyPicClickPayload(offer: NormalizablePriceOffer): boolean {
  if (isLegacyPicClickPriceSource(offer.source)) return true;
  if (picClickUrlInValue(offer.sourceUrl)) return true;
  const raw = offer.rawValue;
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  const nestedUrl = record.sourceUrl ?? record.productUrl;
  return typeof nestedUrl === "string" && picClickUrlInValue(nestedUrl);
}

function ebayListingHost(): string {
  switch (getEbayMarketplaceId()) {
    case "EBAY_US":
      return "www.ebay.com";
    case "EBAY_GB":
      return "www.ebay.co.uk";
    case "EBAY_DE":
      return "www.ebay.de";
    default:
      return "www.ebay.fr";
  }
}

/** PicClick listing URLs embed the underlying eBay item id in the path suffix. */
export function ebayItemUrlFromPicClickUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (!/picclick\./i.test(parsed.hostname)) return null;
    const match = parsed.pathname.match(/-(\d{10,15})\.html$/i);
    if (!match) return null;
    return `https://${ebayListingHost()}/itm/${match[1]}`;
  } catch {
    return null;
  }
}

export function normalizeLegacyPriceOffer<T extends NormalizablePriceOffer>(
  offer: T,
): T {
  if (!legacyPicClickPayload(offer)) return offer;

  const legacyUrl =
    offer.sourceUrl && picClickUrlInValue(offer.sourceUrl)
      ? offer.sourceUrl
      : typeof offer.rawValue === "object" &&
          offer.rawValue &&
          typeof (offer.rawValue as Record<string, unknown>).sourceUrl ===
            "string"
        ? String((offer.rawValue as Record<string, unknown>).sourceUrl)
        : offer.sourceUrl;

  const ebayUrl = legacyUrl ? ebayItemUrlFromPicClickUrl(legacyUrl) : null;
  const rawValue = sanitizePicClickRawValue(offer.rawValue, ebayUrl);

  return {
    ...offer,
    source: "eBay",
    sourceUrl: ebayUrl ?? offer.sourceUrl,
    merchantName: offer.merchantName?.trim() ? offer.merchantName : "eBay",
    rawValue,
  };
}

function sanitizePicClickRawValue(
  rawValue: unknown,
  ebayUrl: string | null,
): unknown {
  if (!rawValue || typeof rawValue !== "object") return rawValue;
  const record = { ...(rawValue as Record<string, unknown>) };
  delete record.productName;
  delete record.title;
  delete record.name;
  if (ebayUrl) record.sourceUrl = ebayUrl;
  return record;
}
