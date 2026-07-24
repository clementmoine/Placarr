import { describe, expect, it } from "vitest";

import {
  ebayItemUrlFromPicClickUrl,
  normalizeLegacyPriceOffer,
} from "./normalizeLegacyPriceOffer";

describe("ebayItemUrlFromPicClickUrl", () => {
  it("extracts the eBay item id from a PicClick listing URL", () => {
    expect(
      ebayItemUrlFromPicClickUrl(
        "https://picclick.fr/Super-Picsou-geant-magazine-n%C2%B01-de-1983-298306332354.html",
      ),
    ).toBe("https://www.ebay.fr/itm/298306332354");
  });

  it("returns null for non-PicClick hosts", () => {
    expect(
      ebayItemUrlFromPicClickUrl("https://www.ebay.fr/itm/298306332354"),
    ).toBeNull();
  });
});

describe("normalizeLegacyPriceOffer", () => {
  it("rewrites PicClick rows to eBay with a direct listing URL", () => {
    const normalized = normalizeLegacyPriceOffer({
      source: "PicClick",
      condition: "used",
      priceCents: 1100,
      sourceUrl:
        "https://picclick.fr/Super-Picsou-geant-magazine-n1-298306332354.html",
      productName: "Super Picsou geant magazine n°1 de 1983",
    });

    expect(normalized.source).toBe("eBay");
    expect(normalized.sourceUrl).toBe("https://www.ebay.fr/itm/298306332354");
    expect(normalized.merchantName).toBe("eBay");
  });

  it("leaves non-PicClick offers untouched", () => {
    const offer = {
      source: "LeDenicheur",
      condition: "used",
      priceCents: 900,
      sourceUrl: "https://ledenicheur.fr/product.php?p=1",
    };
    expect(normalizeLegacyPriceOffer(offer)).toEqual(offer);
  });

  it("sanitizes stale PicClick payload on already-renamed eBay rows", () => {
    const normalized = normalizeLegacyPriceOffer({
      source: "eBay",
      condition: "used",
      priceCents: 1100,
      sourceUrl: "https://www.ebay.fr/itm/298306332354",
      rawValue: {
        productName: "Super Picsou geant magazine n°1 de 1983",
        sourceUrl:
          "https://picclick.fr/Super-Picsou-geant-magazine-n1-298306332354.html",
      },
    });

    expect(normalized.source).toBe("eBay");
    expect(normalized.rawValue).toEqual({
      sourceUrl: "https://www.ebay.fr/itm/298306332354",
    });
  });
});
