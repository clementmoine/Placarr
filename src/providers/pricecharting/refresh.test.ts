import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPricesFromPriceCharting = vi.fn();
const fetchPricesFromPriceChartingGameUrl = vi.fn();

vi.mock("./fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetch")>();
  return {
    ...actual,
    fetchPricesFromPriceCharting: (...args: unknown[]) =>
      fetchPricesFromPriceCharting(...args),
    fetchPricesFromPriceChartingGameUrl: (...args: unknown[]) =>
      fetchPricesFromPriceChartingGameUrl(...args),
  };
});

import { PROVIDER_MODULES } from "@/core/catalog/catalog";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

const pricechartingModule = PROVIDER_MODULES.find(
  (module) => module.info.id === "pricecharting",
)!;

function refreshCtx(
  overrides: Partial<BarcodePriceRefreshContext> = {},
): BarcodePriceRefreshContext {
  return {
    barcodes: [],
    primaryTitle: "Nintendo 64",
    titles: ["Nintendo 64"],
    acceptanceTitles: ["Nintendo 64"],
    shelfType: "hardware",
    cleanedBarcode: "",
    primaryName: "Nintendo 64",
    fallbackNames: [],
    leDenicheurQueries: [],
    isPal: true,
    isClassics: false,
    ...overrides,
  };
}

describe("pricecharting refreshBarcodePriceOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses stored /game/ fiche before name seek", async () => {
    fetchPricesFromPriceChartingGameUrl.mockResolvedValue({
      priceUsed: 6820,
      priceUsedCIB: 21246,
      priceNew: 114110,
      sourceUrl:
        "https://www.pricecharting.com/game/pal-nintendo-64/nintendo-64-system",
      productName: "Nintendo 64 System",
    });

    const offers = await pricechartingModule.refreshBarcodePriceOffers!(
      refreshCtx({
        providerProductUrls: [
          {
            providerKey: "pricecharting",
            url: "https://www.pricecharting.com/game/pal-nintendo-64/nintendo-64-system",
          },
          {
            providerKey: "pricecharting",
            url: "https://www.pricecharting.com/game/nintendo-64/nintendo-64-system",
          },
        ],
      }),
    );

    expect(fetchPricesFromPriceChartingGameUrl).toHaveBeenCalledWith(
      "https://www.pricecharting.com/game/pal-nintendo-64/nintendo-64-system",
    );
    expect(fetchPricesFromPriceCharting).not.toHaveBeenCalled();
    expect(offers.map((offer) => offer.condition)).toEqual([
      "loose",
      "cib",
      "new",
    ]);
    expect(offers[0]?.priceCents).toBe(6820);
  });

  it("falls back to name seek when no stored fiche", async () => {
    fetchPricesFromPriceCharting.mockResolvedValue({
      priceUsed: 5000,
      sourceUrl:
        "https://www.pricecharting.com/game/nintendo-64/nintendo-64-system",
      productName: "Nintendo 64 System",
    });

    const offers = await pricechartingModule.refreshBarcodePriceOffers!(
      refreshCtx(),
    );

    expect(fetchPricesFromPriceChartingGameUrl).not.toHaveBeenCalled();
    expect(fetchPricesFromPriceCharting).toHaveBeenCalled();
    expect(offers[0]?.priceCents).toBe(5000);
  });

  it("skips a finish-mismatched stored fiche after rename", async () => {
    fetchPricesFromPriceChartingGameUrl.mockResolvedValue({
      priceUsed: 12000,
      sourceUrl:
        "https://www.pricecharting.com/game/pal-nintendo-3ds/new-nintendo-3ds-xl-pink-+-white",
      productName: "New Nintendo 3DS XL Pink + White",
    });
    fetchPricesFromPriceCharting.mockResolvedValue({
      priceUsed: 15000,
      sourceUrl:
        "https://www.pricecharting.com/game/pal-nintendo-3ds/new-nintendo-3ds-xl-metallic-blue",
      productName: "New Nintendo 3DS XL Metallic Blue",
    });

    const offers = await pricechartingModule.refreshBarcodePriceOffers!(
      refreshCtx({
        primaryName: "New Nintendo 3DS XL Metallic Blue",
        primaryTitle: "New Nintendo 3DS XL Metallic Blue",
        titles: ["New Nintendo 3DS XL Metallic Blue"],
        acceptanceTitles: ["New Nintendo 3DS XL Metallic Blue"],
        providerProductUrls: [
          {
            providerKey: "pricecharting",
            url: "https://www.pricecharting.com/game/pal-nintendo-3ds/new-nintendo-3ds-xl-pink-+-white",
          },
        ],
      }),
    );

    expect(fetchPricesFromPriceChartingGameUrl).toHaveBeenCalled();
    expect(fetchPricesFromPriceCharting).toHaveBeenCalled();
    expect(offers[0]?.sourceUrl).toContain("metallic-blue");
    expect(offers[0]?.priceCents).toBe(15000);
  });
});
