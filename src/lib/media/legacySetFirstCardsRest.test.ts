import { describe, expect, it } from "vitest";

import {
  legacyLangFirstCardsRest,
  legacySetFirstCardsRest,
  pokemonCardsRestFallbacks,
} from "./legacySetFirstCardsRest";

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

describe("legacyLangFirstCardsRest", () => {
  it("rewrites Pokémon lang-first URLs to Live set-first disk", () => {
    expect(
      legacyLangFirstCardsRest(["cards", "fr", "xy12", "011", "art.webp"]),
    ).toEqual(["cards", "xy12", "fr", "011", "art.webp"]);
  });

  it("leaves set-first paths alone", () => {
    expect(
      legacyLangFirstCardsRest(["cards", "xy12", "en", "011", "art.webp"]),
    ).toBeNull();
  });
});

describe("pokemonCardsRestFallbacks", () => {
  it("tries set-first EN when FR lang-first is requested", () => {
    const alts = pokemonCardsRestFallbacks([
      "cards",
      "fr",
      "bw1",
      "095",
      "mask.webp",
    ]);
    expect(alts).toContainEqual(["cards", "bw1", "en", "095", "mask.webp"]);
    expect(alts).toContainEqual(["cards", "bw1", "en", "095", "mask-ph.webp"]);
  });
});
