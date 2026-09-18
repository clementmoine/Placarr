import { beforeEach, describe, expect, it, vi } from "vitest";

const collectRefreshBarcodePriceOffers = vi.fn();
const persistItemPrices = vi.fn();

vi.mock("@/core/catalog/barcodePrices", () => ({
  collectRefreshBarcodePriceOffers: (...args: unknown[]) =>
    collectRefreshBarcodePriceOffers(...args),
}));

vi.mock("@/core/commerce/pricing/resolver", () => ({
  persistItemPrices: (...args: unknown[]) => persistItemPrices(...args),
}));

import { reconfrontItemPricesFromDurableEvidence } from "./reconfrontFromEvidence";

describe("reconfrontItemPricesFromDurableEvidence", () => {
  beforeEach(() => {
    collectRefreshBarcodePriceOffers.mockReset();
    persistItemPrices.mockReset();
    persistItemPrices.mockResolvedValue({});
  });

  it("no-ops when evidence-only refresh returns nothing", async () => {
    collectRefreshBarcodePriceOffers.mockResolvedValueOnce([]);

    await expect(
      reconfrontItemPricesFromDurableEvidence({
        itemId: "item-1",
        metadataId: "meta-1",
        shelfType: "hardware",
        itemName: "PlayStation 3 Slim Gris",
        aliases: ["PlayStation 3 Slim Silver"],
        barcode: "711719801564",
      }),
    ).resolves.toBe(0);

    expect(collectRefreshBarcodePriceOffers).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceOnly: true,
        primaryName: "PlayStation 3 Slim Gris",
        acceptanceTitles: expect.arrayContaining([
          "PlayStation 3 Slim Gris",
          "PlayStation 3 Slim Silver",
        ]),
      }),
    );
    expect(persistItemPrices).not.toHaveBeenCalled();
  });

  it("persists offers unlocked by the soft alias bag", async () => {
    collectRefreshBarcodePriceOffers.mockResolvedValueOnce([
      {
        source: "Back Market",
        condition: "used",
        priceCents: 8990,
        productName: "CECH-2004A",
        sourceUrl:
          "https://www.backmarket.fr/fr-fr/p/sony-playstation-3-slim-cech-2004a/abc123",
      },
    ]);

    await expect(
      reconfrontItemPricesFromDurableEvidence({
        itemId: "item-1",
        metadataId: "meta-1",
        shelfType: "hardware",
        shelfName: "Consoles",
        itemName: "PlayStation 3 Slim Gris",
        aliases: ["CECH-2004A"],
        barcode: "711719801564",
      }),
    ).resolves.toBe(1);

    expect(persistItemPrices).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "item-1",
        metadataId: "meta-1",
        itemNames: expect.arrayContaining([
          "PlayStation 3 Slim Gris",
          "CECH-2004A",
        ]),
        priceOffers: [
          expect.objectContaining({
            source: "Back Market",
            priceCents: 8990,
          }),
        ],
      }),
    );
  });
});
