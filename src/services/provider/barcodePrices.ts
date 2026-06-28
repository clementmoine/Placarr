import type { BarcodeLookupPayload } from "@/lib/barcode/lookup/payload";
import { finalizeGamePriceProviders } from "@/lib/pricing/cachePolicy";
import type { PriceOfferInput } from "@/services/metadata/evidence";
import { PROVIDER_MODULES } from "@/services/provider/registry";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

export function collectScanPriceOffers(
  payload: BarcodeLookupPayload,
  shelfType: string,
): PriceOfferInput[] {
  return PROVIDER_MODULES.flatMap(
    (module) => module.extractScanPriceOffers?.(payload, shelfType) ?? [],
  );
}

export async function collectRefreshBarcodePriceOffers(
  ctx: BarcodePriceRefreshContext,
): Promise<PriceOfferInput[]> {
  const modules = PROVIDER_MODULES.filter(
    (module) => module.refreshBarcodePriceOffers,
  );
  const settled = await Promise.allSettled(
    modules.map((module) => module.refreshBarcodePriceOffers!(ctx)),
  );
  return settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
}

export function priceProviderTokenFromOffers(
  shelfType: string,
  offers: PriceOfferInput[],
): string {
  const sources = Array.from(
    new Set(offers.map((offer) => offer.source).filter(Boolean)),
  );
  const resolved =
    shelfType === "games"
      ? finalizeGamePriceProviders(sources)
      : sources;
  return resolved.length > 0 ? resolved.join("+") : "None";
}
