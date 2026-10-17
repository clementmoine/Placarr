import { beforeEach, describe, expect, it, vi } from "vitest";

const searchPlayInCardHits = vi.fn();
const fetchPlayInCardPage = vi.fn();
const searchPlayInHits = vi.fn();
const fetchPlayInProduct = vi.fn();
const fetchPlayInBarcodeProduct = vi.fn();

vi.mock("./fetch", () => ({
  searchPlayInCardHits: (...args: unknown[]) => searchPlayInCardHits(...args),
  fetchPlayInCardPage: (...args: unknown[]) => fetchPlayInCardPage(...args),
  searchPlayInHits: (...args: unknown[]) => searchPlayInHits(...args),
  fetchPlayInProduct: (...args: unknown[]) => fetchPlayInProduct(...args),
  fetchPlayInBarcodeProduct: (...args: unknown[]) =>
    fetchPlayInBarcodeProduct(...args),
}));

vi.mock("./resolver", () => ({
  createPlayInResolver: () => vi.fn(),
  mapPlayInMetadata: vi.fn(),
}));

vi.mock("@/core/enrich/retailPriceEvidence", () => ({
  promoteRetailPriceEvidence: vi.fn(),
  readRetailPriceEvidence: vi.fn().mockResolvedValue(null),
}));

import { playinModule } from "./index";

describe("playinModule.refreshBarcodePriceOffers (tcg)", () => {
  beforeEach(() => {
    searchPlayInCardHits.mockReset();
    fetchPlayInCardPage.mockReset();
  });

  it("emits EUR new/foil offers when printKey matches a Lorcana card", async () => {
    searchPlayInCardHits.mockResolvedValue([
      {
        url: "https://www.play-in.com/fr/carte/51053/ariel-sur-des-jambes-humaines",
        productId: "51053",
      },
    ]);
    fetchPlayInCardPage.mockResolvedValue({
      title: "Ariel - Sur des jambes humaines",
      productUrl:
        "https://www.play-in.com/fr/carte/51053/ariel-sur-des-jambes-humaines",
      cardNumber: "1",
      setCode: "1",
      imageSetSlug: "tfc",
      setLabel: "Premier Chapitre",
      offers: [
        { condition: "new", priceCents: 25, label: "Mint/Nmint" },
        { condition: "foil", priceCents: 75, label: "Mint/Nmint FOIL" },
      ],
    });

    const offers = await playinModule.refreshBarcodePriceOffers!({
      shelfType: "tcg",
      shelfName: "Lorcana",
      primaryTitle: "Ariel - Sur des jambes humaines",
      titles: ["Ariel - Sur des jambes humaines"],
      acceptanceTitles: ["Ariel - Sur des jambes humaines"],
      barcodes: [],
      cleanedBarcode: "",
      primaryName: "Ariel - Sur des jambes humaines",
      fallbackNames: [],
      leDenicheurQueries: [],
      isPal: true,
      isClassics: false,
      printKey: "lorcana:1-1",
    });

    expect(searchPlayInCardHits).toHaveBeenCalledWith(
      "Ariel - Sur des jambes humaines",
      6,
    );
    expect(offers).toEqual([
      expect.objectContaining({
        source: "Play-In",
        condition: "new",
        priceCents: 25,
        currency: "EUR",
        metadataScoped: true,
      }),
      expect.objectContaining({
        source: "Play-In",
        condition: "foil",
        priceCents: 75,
        currency: "EUR",
        metadataScoped: true,
      }),
    ]);
  });

  it("skips tcg refresh without a Lorcana printKey", async () => {
    const offers = await playinModule.refreshBarcodePriceOffers!({
      shelfType: "tcg",
      primaryTitle: "Ariel",
      titles: ["Ariel"],
      acceptanceTitles: ["Ariel"],
      barcodes: [],
      cleanedBarcode: "",
      primaryName: "Ariel",
      fallbackNames: [],
      leDenicheurQueries: [],
      isPal: true,
      isClassics: false,
    });
    expect(offers).toEqual([]);
    expect(searchPlayInCardHits).not.toHaveBeenCalled();
  });
});

describe("playinModule info", () => {
  it("declares tcg alongside boardgames", () => {
    expect(playinModule.info.types).toEqual(
      expect.arrayContaining(["boardgames", "tcg"]),
    );
  });
});
