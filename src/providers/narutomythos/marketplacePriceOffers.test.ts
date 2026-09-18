import { beforeEach, describe, expect, it } from "vitest";

import {
  indexNarutomythosMarketplaceListings,
  quoteFromNarutomythosListings,
  refreshNarutomythosMarketplacePriceOffers,
  resetNarutomythosMarketplaceCache,
  type NarutomythosMarketplaceListing,
} from "./marketplacePriceOffers";

const listing = (
  partial: Partial<NarutomythosMarketplaceListing> &
    Pick<NarutomythosMarketplaceListing, "id" | "cardId" | "price">,
): NarutomythosMarketplaceListing => ({
  status: "ACTIVE",
  currency: "EUR",
  ...partial,
});

describe("narutomythos.com marketplace prices", () => {
  beforeEach(() => {
    resetNarutomythosMarketplaceCache();
  });

  it("indexes listings onto official printKeys and keeps the lowest EUR quote", () => {
    const byKey = indexNarutomythosMarketplaceListings([
      listing({
        id: "a",
        cardId: "KS-106-A",
        price: 8,
        card: { nameFr: "Kakashi — A" },
        externalUrl: "https://www.vinted.fr/items/1",
      }),
      listing({
        id: "b",
        cardId: "KS-106-A",
        price: 4,
        card: { nameFr: "Kakashi — A" },
        externalUrl: "https://www.vinted.fr/items/2",
      }),
      listing({ id: "c", cardId: "KS-001", price: 2, status: "SOLD" }),
    ]);

    expect(byKey.get("mythos:ks1-0106-a")?.map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
    expect(byKey.has("mythos:ks1-0001")).toBe(false);

    const quote = quoteFromNarutomythosListings(
      byKey.get("mythos:ks1-0106-a") ?? [],
    );
    expect(quote).toMatchObject({
      cents: 400,
      currency: "EUR",
      offerCount: 2,
      sourceUrl: "https://www.vinted.fr/items/2",
    });
  });

  it("emits a used EUR offer for the matching printKey", async () => {
    const { loadNarutomythosMarketplaceIndex } = await import(
      "./marketplacePriceOffers"
    );
    await loadNarutomythosMarketplaceIndex({
      listings: [
        listing({
          id: "x",
          cardId: "KS-106-A",
          price: 4.5,
          card: { nameFr: "Kakashi Hatake — Le Ninja Copieur" },
          externalUrl: "https://www.vinted.fr/items/9",
        }),
      ],
    });

    const offers = await refreshNarutomythosMarketplacePriceOffers({
      barcodes: [],
      cleanedBarcode: "",
      primaryTitle: "Kakashi Hatake — Le Ninja Copieur",
      primaryName: "Kakashi Hatake — Le Ninja Copieur",
      titles: ["Kakashi Hatake — Le Ninja Copieur"],
      acceptanceTitles: ["Kakashi Hatake — Le Ninja Copieur"],
      fallbackNames: [],
      leDenicheurQueries: [],
      shelfType: "tcg",
      printKey: "mythos:ks1-0106-a",
      isPal: false,
      isClassics: false,
    });

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      source: "narutomythos.com",
      condition: "used",
      priceCents: 450,
      currency: "EUR",
      sourceUrl: "https://www.vinted.fr/items/9",
      metadataScoped: true,
    });
  });
});
