import type {
  BarcodeLookupPayload,
  BarcodeLookupSlotDefaults,
} from "@/core/identify/lookup/payload";
import { finalizeGamePriceProviders } from "@/core/commerce/pricing/resolver";
import type { PriceOfferInput } from "@/core/enrich/evidence";
import { runWithConcurrency, yieldToEventLoop } from "@/lib/async";
import {
  resolveRequestAbortSignal,
  throwIfJobAborted,
} from "@/lib/http/jobAbort";
import { PROVIDER_MODULES } from "./registry";
import type {
  BarcodeLookupType,
  BarcodePriceRefreshContext,
} from "@/types/providerModule";

/** Parallel price scrapers also share the Next event loop — keep this low and yield. */
const BARCODE_PRICE_REFRESH_CONCURRENCY = 2;

/**
 * Slots core owns across providers: the retailer aggregate and the media-typed
 * fan-out of the single `cal` task. Everything provider-specific is declared by
 * the provider module itself (`barcodeLookupSlots` + `declare module`).
 */
const CORE_SLOT_DEFAULTS = {
  ol: () => null,
  mb: () => null,
  ss: () => null,
  pc: () => null,
  sd: () => null,
  retailers: () => [],
  amc: () => [],
  calFr: () => [],
  calDvd: () => [],
  calMusic: () => [],
  calToys: () => [],
  calJeuxVideo: () => [],
  calGeneric: () => [],
  leDenicheur: () => null,
  ice: () => null,
} satisfies Partial<BarcodeLookupSlotDefaults>;

/**
 * Empty value for every lookup slot: core's own plus each provider's.
 * The one place that needs the registry, so `payload.ts` stays importable by
 * provider modules without a cycle.
 */
export function barcodeLookupSlotDefaults(): BarcodeLookupSlotDefaults {
  const defaults: Record<string, () => unknown> = { ...CORE_SLOT_DEFAULTS };
  for (const providerModule of PROVIDER_MODULES) {
    Object.assign(defaults, providerModule.barcodeLookupSlots ?? {});
  }
  return defaults as unknown as BarcodeLookupSlotDefaults;
}

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
  const signal = resolveRequestAbortSignal(ctx.signal);
  const modules = PROVIDER_MODULES.filter((module) => {
    if (
      !module.refreshBarcodePriceOffers ||
      !moduleSupportsShelfType(module.info.types, ctx.shelfType)
    ) {
      return false;
    }
    // Evidence-only reconfront must not wake scrapers that still HTTP on miss.
    if (ctx.evidenceOnly && !module.info.evidenceOnlyPriceRefresh) {
      return false;
    }
    return true;
  });
  const settled = await runWithConcurrency(
    modules,
    BARCODE_PRICE_REFRESH_CONCURRENCY,
    async (module) => {
      throwIfJobAborted(signal);
      await yieldToEventLoop();
      try {
        return await module.refreshBarcodePriceOffers!({
          ...ctx,
          ...(signal ? { signal } : {}),
        });
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === "AbortError" || error.name === "CanceledError")
        ) {
          throw error;
        }
        return [] as PriceOfferInput[];
      } finally {
        await yieldToEventLoop();
      }
    },
    { signal },
  );
  return settled
    .filter((row): row is PriceOfferInput[] => Array.isArray(row))
    .flat();
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
