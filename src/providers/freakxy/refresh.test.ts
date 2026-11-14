import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchFromFreakxy = vi.fn();
const readFreakxySearchEvidence = vi.fn();

vi.mock("./fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetch")>();
  return {
    ...actual,
    fetchFromFreakxy: (...args: unknown[]) => fetchFromFreakxy(...args),
  };
});

vi.mock("./durableEvidence", () => ({
  readFreakxySearchEvidence: (...args: unknown[]) =>
    readFreakxySearchEvidence(...args),
  promoteFreakxySearchEvidence: vi.fn(),
}));

import { PROVIDER_MODULES } from "@/core/catalog/catalog";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

const freakxyModule = PROVIDER_MODULES.find(
  (module) => module.info.id === "freakxy",
)!;

function refreshCtx(
  overrides: Partial<BarcodePriceRefreshContext> = {},
): BarcodePriceRefreshContext {
  return {
    barcodes: ["711719541226"],
    primaryTitle: "Manette DualSense",
    titles: ["Manette DualSense"],
    acceptanceTitles: ["Manette DualSense"],
    shelfType: "hardware",
    cleanedBarcode: "711719541226",
    primaryName: "Manette DualSense",
    fallbackNames: [],
    leDenicheurQueries: [],
    isPal: true,
    isClassics: false,
    ...overrides,
  };
}

describe("freakxy refreshBarcodePriceOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits a new-condition offer from Magento EUR cents", async () => {
    fetchFromFreakxy.mockResolvedValue([
      {
        name: "Manette DualSense Midnight Black",
        coverUrl: "https://www.freakxy.fr/media/dualsense.jpg",
        priceCents: 6990,
        priceNew: 6990,
        sourceUrl: "https://www.freakxy.fr/manette-dualsense.html",
      },
    ]);

    const offers =
      await freakxyModule.refreshBarcodePriceOffers!(refreshCtx());

    expect(fetchFromFreakxy).toHaveBeenCalledWith("711719541226");
    expect(offers).toHaveLength(1);
    expect(offers[0]?.condition).toBe("new");
    expect(offers[0]?.priceCents).toBe(6990);
    expect(offers[0]?.sourceUrl).toContain("manette-dualsense");
  });

  it("evidenceOnly reuses SearchYield without live fetch", async () => {
    readFreakxySearchEvidence.mockResolvedValue([
      {
        name: "Manette DualSense Midnight Black",
        priceCents: 6990,
        priceNew: 6990,
      },
    ]);

    const offers = await freakxyModule.refreshBarcodePriceOffers!(
      refreshCtx({ evidenceOnly: true }),
    );

    expect(fetchFromFreakxy).not.toHaveBeenCalled();
    expect(offers[0]?.priceCents).toBe(6990);
  });

  it("returns [] for evidenceOnly miss", async () => {
    readFreakxySearchEvidence.mockResolvedValue(null);
    const offers = await freakxyModule.refreshBarcodePriceOffers!(
      refreshCtx({ evidenceOnly: true }),
    );
    expect(offers).toEqual([]);
  });
});
