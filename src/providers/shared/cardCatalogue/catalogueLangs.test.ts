import { describe, expect, it } from "vitest";

import {
  catalogueLangOrder,
  isCatalogueLang,
  isCatalogueProductLang,
} from "./catalogueLangs";

describe("catalogueLangs", () => {
  it("Original obligatoire, FR si existe, EN si dispo — rien d'autre", () => {
    // One Piece: JA original
    expect(isCatalogueLang("ja", ["ja"])).toBe(true);
    expect(isCatalogueLang("fr", ["ja"])).toBe(true);
    expect(isCatalogueLang("en", ["ja"])).toBe(true);
    expect(isCatalogueLang("th", ["ja"])).toBe(false);
    expect(isCatalogueLang("de", ["ja"])).toBe(false);
    // Magic: EN original
    expect(isCatalogueLang("en", ["en"])).toBe(true);
    expect(isCatalogueLang("fr", ["en"])).toBe(true);
    expect(isCatalogueLang("ja", ["en"])).toBe(false);
    // Ninja Ranks: IT is original
    expect(isCatalogueLang("it", ["en", "fr", "it"])).toBe(true);
    expect(isCatalogueLang("de", ["en", "fr", "it"])).toBe(false);
  });

  it("orders originals then fr then en", () => {
    expect(catalogueLangOrder(["ja"])).toEqual(["ja", "fr", "en"]);
    expect(catalogueLangOrder(["en"])).toEqual(["en", "fr"]);
    expect(catalogueLangOrder(["fr"])).toEqual(["fr", "en"]);
  });

  it("filters sealed langs to the pack contract", () => {
    expect(isCatalogueProductLang("de", ["en", "fr"])).toBe(false);
    expect(isCatalogueProductLang("it", ["en", "fr"])).toBe(false);
    expect(isCatalogueProductLang("fr", ["en", "fr"])).toBe(true);
    expect(isCatalogueProductLang("IT", ["en", "fr", "it"])).toBe(true);
    // unset locales → JA+FR+EN default (hide DE/IT)
    expect(isCatalogueProductLang("ja", undefined)).toBe(true);
    expect(isCatalogueProductLang("de", undefined)).toBe(false);
  });
});
