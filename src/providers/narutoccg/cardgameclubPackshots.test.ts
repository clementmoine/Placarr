import { describe, expect, it } from "vitest";

import {
  cardgameclubImageUrl,
  cardgameclubIngestPackshots,
  cardgameclubLedger,
} from "./cardgameclubPackshots";
import { narutoCatalogueLineForSealed } from "./packs";

describe("cardgameclub CACG IT packshots", () => {
  it("keeps the six pasted SKUs and does not crawl the collection", () => {
    const ledger = cardgameclubLedger();
    expect(ledger.ingestCollection).toBe(false);
    expect(cardgameclubIngestPackshots().map((row) => row.slug)).toEqual([
      "display-s1-it",
      "starter-forza-della-foglia",
      "booster-s1-it",
      "display-s2-it",
      "booster-s2-it",
      "booster-s3-it",
    ]);
    expect(ledger.products.every((row) => row.lang === "IT")).toBe(true);
    expect(ledger.products.every((row) => row.barcode === null)).toBe(true);
    expect(
      ledger.products.every((row) =>
        row.url.startsWith("https://cardgameclub.it/products/"),
      ),
    ).toBe(true);
    expect(ledger.probedMissingSealed.status).toBe(404);
    expect(ledger.probedMissingSealed.handles).toContain("na06riv-ica08bu");
    expect(
      ledger.probedMissingSealed.handles.every((h) => !h.includes("na01")),
    ).toBe(true);
  });

  it("drops Shopify cache query strings", () => {
    expect(
      cardgameclubImageUrl(
        "https://cdn.shopify.com/s/files/1/0918/2072/0513/files/image_a.png?v=1786449412",
      ),
    ).toBe(
      "https://cdn.shopify.com/s/files/1/0918/2072/0513/files/image_a.png",
    );
  });

  it("files Italian displays on CACG, not Bandai CCG", () => {
    expect(
      narutoCatalogueLineForSealed({
        slug: "display-s1-it",
        setCode: "s1",
        lang: "IT",
      }),
    ).toBe("carddass-fr");
    expect(
      narutoCatalogueLineForSealed({
        slug: "booster-s2-it",
        setCode: "s2",
        lang: "IT",
      }),
    ).toBe("carddass-fr");
    expect(
      narutoCatalogueLineForSealed({
        slug: "display-s13",
        setCode: "s13",
      }),
    ).toBe("en-ccg");
  });
});
