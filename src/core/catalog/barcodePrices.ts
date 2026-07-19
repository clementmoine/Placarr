import type { BarcodeLookupPayload } from "@/core/identify/lookup/payload";
import { finalizeGamePriceProviders } from "@/core/commerce/pricing/resolver";
import type { PriceOfferInput } from "@/core/enrich/evidence";
import { runWithConcurrency } from "@/lib/async/runWithConcurrency";
import { yieldToEventLoop } from "@/lib/async/yieldToEventLoop";
import { PROVIDER_MODULES } from "./registry";
import type {
  BarcodeLookupType,
  BarcodePriceRefreshContext,
} from "@/types/providerModule";

/** Parallel price scrapers also share the Next event loop — keep this low and yield. */
const BARCODE_PRICE_REFRESH_CONCURRENCY = 2;

function moduleSupportsShelfType(
  types: readonly string[],
  shelfType: string,
): shelfType is BarcodeLookupType {
  return (types as readonly string[]).includes(shelfType);
}

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
    (module) =>
      module.refreshBarcodePriceOffers &&
      moduleSupportsShelfType(module.info.types, ctx.shelfType),
  );
  const settled = await runWithConcurrency(
    modules,
    BARCODE_PRICE_REFRESH_CONCURRENCY,
    async (module) => {
      await yieldToEventLoop();
      try {
        return await module.refreshBarcodePriceOffers!(ctx);
      } catch {
        return [] as PriceOfferInput[];
      } finally {
        await yieldToEventLoop();
      }
    },
  );
  return settled.flat();
}

export function priceProviderTokenFromOffers(
  shelfType: string,
  offers: PriceOfferInput[],
): string {
  const sources = Array.from(
    new Set(offers.map((offer) => offer.source).filter(Boolean)),
  );
  const resolved =
    shelfType === "games" ? finalizeGamePriceProviders(sources) : sources;
  return resolved.length > 0 ? resolved.join("+") : "None";
}
