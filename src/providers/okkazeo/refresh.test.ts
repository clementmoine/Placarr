import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchOkkazeoGame = vi.fn();
const searchOkkazeo = vi.fn();
const fetchOkkazeoBarcodeProduct = vi.fn();

vi.mock("./fetch", () => ({
  fetchOkkazeoBarcodeProduct: (...args: unknown[]) =>
    fetchOkkazeoBarcodeProduct(...args),
  fetchOkkazeoGame: (...args: unknown[]) => fetchOkkazeoGame(...args),
  searchOkkazeo: (...args: unknown[]) => searchOkkazeo(...args),
}));

import { PROVIDER_MODULES } from "@/core/catalog/catalog";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";

const okkazeoModule = PROVIDER_MODULES.find(
  (module) => module.info.id === "okkazeo",
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

describe("okkazeo refreshBarcodePriceOffers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses stored product URL before barcode search", async () => {
    fetchOkkazeoGame.mockResolvedValue({
      title: "Black Stories",
      priceCents: 1200,
      productUrl: "https://www.okkazeo.com/jeu/black-stories/123.html",
    });

    const offers = await okkazeoModule.refreshBarcodePriceOffers!(
      refreshCtx({
        providerProductUrls: [
          {
            providerKey: "okkazeo",
            url: "https://www.okkazeo.com/jeu/black-stories/123.html",
          },
        ],
      }),
    );

    expect(fetchOkkazeoGame).toHaveBeenCalledWith(
      "https://www.okkazeo.com/jeu/black-stories/123.html",
    );
    expect(searchOkkazeo).not.toHaveBeenCalled();
    expect(offers).toHaveLength(1);
    expect(offers[0]?.sourceUrl).toContain("okkazeo.com");
  });

  it("falls back to barcode search when no stored URL resolves", async () => {
    searchOkkazeo.mockResolvedValue({
      url: "https://www.okkazeo.com/jeu/black-stories/456.html",
    });
    fetchOkkazeoGame.mockResolvedValue({
      title: "Black Stories",
      barcode: "0827912079678",
      priceCents: 990,
      productUrl: "https://www.okkazeo.com/jeu/black-stories/456.html",
    });

    const offers = await okkazeoModule.refreshBarcodePriceOffers!(refreshCtx());

    expect(searchOkkazeo).toHaveBeenCalledWith("", "0827912079678");
    expect(offers).toHaveLength(1);
  });

  it("rejects barcode search hits with a mismatched EAN", async () => {
    searchOkkazeo.mockResolvedValue({
      url: "https://www.okkazeo.com/jeu/black-stories-suspect/456.html",
    });
    fetchOkkazeoGame.mockResolvedValue({
      title: "Black Stories Suspect",
      barcode: "087169139338",
      priceCents: 990,
      productUrl: "https://www.okkazeo.com/jeu/black-stories-suspect/456.html",
    });

    const offers = await okkazeoModule.refreshBarcodePriceOffers!(refreshCtx());

    expect(offers).toHaveLength(0);
  });
});
