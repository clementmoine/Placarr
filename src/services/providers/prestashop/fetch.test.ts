import { describe, expect, it } from "vitest";

import { parsePrestashopGallery, prestashopImageId } from "./fetch";

describe("prestashopImageId", () => {
  it("extrait l'id image quelle que soit la taille", () => {
    expect(
      prestashopImageId("https://www.monsieurde.com/11949-large_default/x.jpg"),
    ).toBe("11949");
    expect(prestashopImageId("https://www.monsieurde.com/11949/x.jpg")).toBe(
      "11949",
    );
    expect(prestashopImageId(null)).toBeNull();
  });
});

describe("parsePrestashopGallery", () => {
  it("extrait les images produit distinctes via data-image-large-src", () => {
    const html = `
      <img data-image-large-src="https://www.monsieurde.com/11949-large_default/jeu.jpg">
      <img data-image-large-src="https://www.monsieurde.com/11949-large_default/jeu.jpg">
      <img data-image-large-src="https://www.monsieurde.com/11950-large_default/jeu.jpg">
      <img src="https://www.monsieurde.com/99999-home_default/cross-sell.jpg">
    `;

    expect(parsePrestashopGallery(html)).toEqual([
      "https://www.monsieurde.com/11949-large_default/jeu.jpg",
      "https://www.monsieurde.com/11950-large_default/jeu.jpg",
    ]);
  });

  it("renvoie une liste vide sans galerie", () => {
    expect(parsePrestashopGallery("<div>pas d'images</div>")).toEqual([]);
  });
});
