import type { PriceOfferInput } from "@/services/metadata/evidence";

export function pricedOffer(
  source: string,
  condition: string,
  priceCents: unknown,
  rawValue: unknown,
  extra: Partial<PriceOfferInput> = {},
): PriceOfferInput | null {
  if (typeof priceCents !== "number" || priceCents <= 0) return null;
  return { source, condition, priceCents, rawValue, ...extra };
}

export function pricedOffers(
  source: string,
  rows: Array<{
    condition: string;
    priceCents: unknown;
    rawValue: unknown;
    extra?: Partial<PriceOfferInput>;
  }>,
): PriceOfferInput[] {
  return rows.flatMap((row) => {
    const offer = pricedOffer(
      source,
      row.condition,
      row.priceCents,
      row.rawValue,
      row.extra,
    );
    return offer ? [offer] : [];
  });
}
