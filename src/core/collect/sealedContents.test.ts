import { describe, expect, it } from "vitest";

import {
  cardsPerPackFromShopText,
  packsContainedFromShopText,
  resolveSealedContents,
} from "./sealedContents";

describe("sealedContents", () => {
  it("reads cards per pack from the shop name", () => {
    expect(
      cardsPerPackFromShopText("Booster 12 cartes Premier Chapitre - Maléfique"),
    ).toBe(12);
    expect(cardsPerPackFromShopText("Booster 452 cartes")).toBeNull();
  });

  it("reads packs in a display from name or slug", () => {
    expect(packsContainedFromShopText("Display 24 boosters Premier Chapitre")).toBe(
      24,
    );
    expect(
      packsContainedFromShopText("display-24-boosters-premier-chapitre"),
    ).toBe(24);
    expect(packsContainedFromShopText("booster-premier-chapitre")).toBeNull();
  });

  it("resolves booster contents from name, not set-sized declared counts", () => {
    expect(
      resolveSealedContents({
        kind: "booster",
        name: "Booster 12 cartes Premier Chapitre - Maléfique",
        slug: "booster-premier-chapitre-malefique",
        declaredCardCount: 420,
      }),
    ).toEqual({ cardsPerPack: 12, packsContained: 1 });
  });

  it("falls back to a small declared count (Naruto-style pack size)", () => {
    expect(
      resolveSealedContents({
        kind: "booster",
        name: "Booster Série 1",
        slug: "booster-s1",
        declaredCardCount: 8,
      }),
    ).toEqual({ cardsPerPack: 8, packsContained: 1 });
  });

  it("resolves display pack count from the slug when the name is empty", () => {
    expect(
      resolveSealedContents({
        kind: "display",
        name: null,
        slug: "display-24-boosters-premier-chapitre",
        declaredCardCount: null,
      }),
    ).toEqual({ cardsPerPack: null, packsContained: 24 });
  });
});
