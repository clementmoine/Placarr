import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPricesFromChasseAuxLivres = vi.fn();

vi.mock("./fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetch")>();
  return {
    ...actual,
    fetchPricesFromChasseAuxLivres: (...args: unknown[]) =>
      fetchPricesFromChasseAuxLivres(...args),
  };
});

import { PROVIDER_MODULES } from "@/services/provider/catalog";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

const chasseModule = PROVIDER_MODULES.find(
  (module) => module.info.id === "chasseauxlivres",
)!;

function refreshCtx(
  overrides: Partial<BarcodePriceRefreshContext> = {},
): BarcodePriceRefreshContext {
  return {
    shelfType: "boardgames",
    cleanedBarcode: "0827912079678",
    primaryName: "Black Stories",
    fallbackNames: [],
    leDenicheurQueries: [],
    isPal: false,
    isClassics: false,
    ...overrides,
  };
}

describe("chasseauxlivres refreshBarcodePriceOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses stored product URL before barcode search when EAN is confirmed", async () => {
    fetchPricesFromChasseAuxLivres.mockResolvedValue({
      name: "Black Stories",
      priceNew: 730,
      priceUsed: 198,
      productUrl:
        "https://www.chasse-aux-livres.fr/prix/B001K9E2SQ/iello-black-stories-0827912079678.html",
    });

    const offers = await chasseModule.refreshBarcodePriceOffers!(
      refreshCtx({
        providerProductUrls: [
          {
            providerKey: "chasseauxlivres",
            url: "https://www.chasse-aux-livres.fr/prix/B001K9E2SQ/iello-black-stories-0827912079678.html",
          },
        ],
      }),
    );

    expect(fetchPricesFromChasseAuxLivres).toHaveBeenCalledTimes(1);
    expect(fetchPricesFromChasseAuxLivres).toHaveBeenCalledWith(
      "https://www.chasse-aux-livres.fr/prix/B001K9E2SQ/iello-black-stories-0827912079678.html",
      expect.any(String),
      expect.objectContaining({ anchoredItemBarcode: "0827912079678" }),
    );
    expect(offers.length).toBeGreaterThan(0);
  });

  it("ignores stored URLs without a confirmed EAN when the item is barcode-anchored", async () => {
    fetchPricesFromChasseAuxLivres.mockResolvedValue({
      name: "Black Stories",
      priceNew: 730,
      priceUsed: 198,
      productUrl:
        "https://www.chasse-aux-livres.fr/prix/B001K9E2SQ/iello-black-stories",
    });

    await chasseModule.refreshBarcodePriceOffers!(
      refreshCtx({
        providerProductUrls: [
          {
            providerKey: "chasseauxlivres",
            url: "https://www.chasse-aux-livres.fr/prix/B071ZXH7MV/black-stories-fantastique",
          },
        ],
      }),
    );

    expect(fetchPricesFromChasseAuxLivres).not.toHaveBeenCalledWith(
      "https://www.chasse-aux-livres.fr/prix/B071ZXH7MV/black-stories-fantastique",
      expect.anything(),
      expect.anything(),
    );
    expect(fetchPricesFromChasseAuxLivres).toHaveBeenCalledWith(
      "0827912079678",
      expect.any(String),
      expect.objectContaining({ anchoredItemBarcode: "0827912079678" }),
    );
  });

  it("ignores stored URLs whose slug EAN conflicts and falls back to seek", async () => {
    fetchPricesFromChasseAuxLivres.mockResolvedValue(null);

    await chasseModule.refreshBarcodePriceOffers!(
      refreshCtx({
        providerProductUrls: [
          {
            providerKey: "chasseauxlivres",
            url: "https://www.chasse-aux-livres.fr/prix/B01/black-stories-suspect-087169139338.html",
          },
        ],
      }),
    );

    expect(fetchPricesFromChasseAuxLivres).toHaveBeenCalledWith(
      "0827912079678",
      expect.any(String),
      expect.objectContaining({ anchoredItemBarcode: "0827912079678" }),
    );
    expect(fetchPricesFromChasseAuxLivres).not.toHaveBeenCalledWith(
      "https://www.chasse-aux-livres.fr/prix/B01/black-stories-suspect-087169139338.html",
      expect.anything(),
      expect.anything(),
    );
  });

  it("retombe sur le titre quand la recherche EAN seule ne résout rien", async () => {
    fetchPricesFromChasseAuxLivres
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        name: "Iello - Black Stories",
        priceNew: 1698,
        productUrl:
          "https://www.chasse-aux-livres.fr/prix/B001K9E2SQ/iello-black-stories",
      });

    const offers = await chasseModule.refreshBarcodePriceOffers!(
      refreshCtx({
        primaryName: "Black Stories",
        fallbackNames: ["Black Stories"],
      }),
    );

    expect(fetchPricesFromChasseAuxLivres).toHaveBeenNthCalledWith(
      1,
      "0827912079678",
      expect.any(String),
      expect.objectContaining({ anchoredItemBarcode: "0827912079678" }),
    );
    expect(fetchPricesFromChasseAuxLivres).toHaveBeenNthCalledWith(
      2,
      "Black Stories",
      expect.any(String),
      expect.objectContaining({ anchoredItemBarcode: "0827912079678" }),
    );
    expect(offers.length).toBeGreaterThan(0);
  });
});
