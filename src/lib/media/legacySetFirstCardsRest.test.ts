import { describe, expect, it } from "vitest";

import { legacySetFirstCardsRest } from "./legacySetFirstCardsRest";

describe("legacySetFirstCardsRest", () => {
  it("rewrites Dragon Ball JCC set-first URLs to lang-first", () => {
    expect(
      legacySetFirstCardsRest([
        "cards",
        "part3",
        "fr",
        "d0270a",
        "art.dbzcollection.jpg",
      ]),
    ).toEqual([
      "cards",
      "fr",
      "part3",
      "d0270a",
      "art.dbzcollection.jpg",
    ]);
  });

  it("rewrites Dragon Ball Masters CG set-first URLs to lang-first", () => {
    expect(
      legacySetFirstCardsRest([
        "cards",
        "bt3",
        "fr",
        "104",
        "art.dbscards.webp",
      ]),
    ).toEqual(["cards", "fr", "bt3", "104", "art.dbscards.webp"]);
  });

  it("leaves already lang-first paths alone", () => {
    expect(
      legacySetFirstCardsRest([
        "cards",
        "fr",
        "part3",
        "d0270a",
        "art.dbzcollection.jpg",
      ]),
    ).toBeNull();
  });

  it("ignores non-card asset paths", () => {
    expect(legacySetFirstCardsRest(["products", "bt1", "fr", "x"])).toBeNull();
    expect(legacySetFirstCardsRest(["cards", "part3", "fr"])).toBeNull();
  });
});
