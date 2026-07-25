import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PriceOfferInput } from "@/core/enrich/evidence";
import type {
  BarcodePriceRefreshContext,
  ProviderModule,
} from "@/types/providerModule";

const evidenceAwareRefresh = vi.fn();
const httpOnlyRefresh = vi.fn();

/**
 * Two price modules: one that honors `evidenceOnly` (declared in `info`) and a
 * legacy one that would still hit the network on an evidence miss.
 */
vi.mock("@/core/catalog/registry", () => ({
  PROVIDER_MODULES: [
    {
      info: {
        id: "evidence-aware",
        label: "Evidence Aware",
        types: ["hardware"],
        capabilities: ["price"],
        evidenceOnlyPriceRefresh: true,
      },
      refreshBarcodePriceOffers: (ctx: BarcodePriceRefreshContext) =>
        evidenceAwareRefresh(ctx),
    },
    {
      info: {
        id: "http-only",
        label: "HTTP Only",
        types: ["hardware"],
        capabilities: ["price"],
      },
      refreshBarcodePriceOffers: (ctx: BarcodePriceRefreshContext) =>
        httpOnlyRefresh(ctx),
    },
  ] as unknown as ProviderModule[],
}));

const { collectRefreshBarcodePriceOffers } = await import(
  "@/core/catalog/barcodePrices"
);

function refreshCtx(
  overrides: Partial<BarcodePriceRefreshContext> = {},
): BarcodePriceRefreshContext {
  return {
    shelfType: "hardware",
    barcodes: ["711719801564"],
    cleanedBarcode: "711719801564",
    primaryName: "PlayStation 3 Slim Gris",
    fallbackNames: ["PlayStation 3 Slim Silver"],
    titles: ["PlayStation 3 Slim Gris"],
    acceptanceTitles: ["PlayStation 3 Slim Gris", "PlayStation 3 Slim Silver"],
    isPal: true,
    isClassics: false,
    ...overrides,
  } as BarcodePriceRefreshContext;
}

const offer: PriceOfferInput = {
  source: "Evidence Aware",
  condition: "used",
  priceCents: 8990,
} as PriceOfferInput;

describe("collectRefreshBarcodePriceOffers — evidenceOnly", () => {
  beforeEach(() => {
    evidenceAwareRefresh.mockReset();
    httpOnlyRefresh.mockReset();
    evidenceAwareRefresh.mockResolvedValue([offer]);
    httpOnlyRefresh.mockResolvedValue([]);
  });

  it("runs every price module on a normal refresh", async () => {
    await collectRefreshBarcodePriceOffers(refreshCtx());

    expect(evidenceAwareRefresh).toHaveBeenCalledTimes(1);
    expect(httpOnlyRefresh).toHaveBeenCalledTimes(1);
  });

  it("skips modules that do not honor evidenceOnly", async () => {
    const offers = await collectRefreshBarcodePriceOffers(
      refreshCtx({ evidenceOnly: true }),
    );

    expect(httpOnlyRefresh).not.toHaveBeenCalled();
    expect(evidenceAwareRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceOnly: true }),
    );
    expect(offers).toEqual([offer]);
  });
});
