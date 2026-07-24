import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./fetch", () => ({
  fetchPricesFromEbay: vi.fn(),
}));

import { fetchPricesFromEbay } from "./fetch";
import { ebayModule } from "./index";
import {
  buildMatchContext,
  toBarcodePriceRefreshContext,
} from "@/core/catalog/matchContext";

const mockedFetchPrices = vi.mocked(fetchPricesFromEbay);

const refreshCtx = () =>
  toBarcodePriceRefreshContext(
    buildMatchContext({
      shelfType: "books",
      shelfName: "Les Trésors de Picsou",
      primaryTitle: "Les Trésors de Picsou n°63",
      titles: [
        "Les Trésors de Picsou n°63",
        "Les trésors de Picsou n°63",
        "Les Trésors de Picsou 63",
      ],
      acceptanceTitles: [
        "Les Trésors de Picsou n°63",
        "Les trésors de Picsou n°63",
        "Les Trésors de Picsou 63",
      ],
    }),
  );

beforeEach(() => {
  mockedFetchPrices.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ebay refreshBarcodePriceOffers", () => {
  it("tries primary title, distinct fallback, and ascii marketplace variants", async () => {
    mockedFetchPrices.mockResolvedValue(null);

    await ebayModule.refreshBarcodePriceOffers!(refreshCtx());

    expect(mockedFetchPrices.mock.calls.map(([query]) => query)).toEqual([
      "Les Trésors de Picsou n°63",
      "Les Tresors de Picsou N 63",
      "Les Trésors de Picsou 63",
      "Les Tresors de Picsou 63",
    ]);
  });

  it("prefers barcode before title seeks", async () => {
    mockedFetchPrices.mockResolvedValue(null);

    await ebayModule.refreshBarcodePriceOffers!(
      toBarcodePriceRefreshContext(
        buildMatchContext({
          shelfType: "games",
          shelfName: "Switch",
          primaryTitle: "Hades",
          titles: ["Hades"],
          barcodes: ["0045496365226"],
        }),
      ),
    );

    expect(mockedFetchPrices.mock.calls.map(([query]) => query)).toEqual([
      "0045496365226",
      "Hades",
    ]);
  });

  it("returns priced offers from the first successful query", async () => {
    mockedFetchPrices
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        priceUsed: 1200,
        productName: "Les Trésors de Picsou N°63 - Magazine Disney",
        sourceUrl: "https://www.ebay.fr/itm/123",
        offerCount: 2,
      });

    const offers = await ebayModule.refreshBarcodePriceOffers!(refreshCtx());

    expect(mockedFetchPrices).toHaveBeenCalledTimes(2);
    expect(offers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "eBay",
          condition: "used",
          priceCents: 1200,
          productName: "Les Trésors de Picsou N°63 - Magazine Disney",
        }),
      ]),
    );
  });
});
