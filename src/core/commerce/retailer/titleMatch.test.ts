import { describe, expect, it } from "vitest";

import {
  catalogTitleOmitsRequestedProductIdentity,
  isNameOnlyRetailerTitleMatch,
  priceListingSharesItemIdentity,
  retailerCatalogSharesRequestedIdentity,
} from "./titleMatch";

describe("catalogTitleOmitsRequestedProductIdentity", () => {
  it("flags franchise-only catalog rows for a specific scenario line", () => {
    expect(
      catalogTitleOmitsRequestedProductIdentity(
        "Black Stories - Musique D'enfer",
        "Black Stories",
      ),
    ).toBe(true);
  });

  it("allows a shorter identity query when the catalog keeps the product line", () => {
    expect(
      catalogTitleOmitsRequestedProductIdentity(
        "Alan Wake II Deluxe Edition",
        "Alan Wake II Deluxe Edition PS5",
      ),
    ).toBe(false);
  });

  it("does not flag equal or longer catalog titles", () => {
    expect(
      catalogTitleOmitsRequestedProductIdentity("Catan", "Catan — Édition FR"),
    ).toBe(false);
    expect(
      catalogTitleOmitsRequestedProductIdentity(
        "Black Stories - Musique D'enfer",
        "Black Stories Musique d'Enfer",
      ),
    ).toBe(false);
  });

  it("does not treat padded vs unpadded magazine issues as omitted identity", () => {
    expect(
      catalogTitleOmitsRequestedProductIdentity(
        "Super Picsou Géant n°036",
        "SUPER PICSOU GEANT n°36",
      ),
    ).toBe(false);
  });

  it("keeps Nightfire when the catalog drops the James Bond franchise lead", () => {
    expect(
      catalogTitleOmitsRequestedProductIdentity(
        "James Bond 007 Nightfire",
        "007 Nightfire",
      ),
    ).toBe(false);
    expect(
      priceListingSharesItemIdentity(
        "James Bond 007 Nightfire",
        "007 Nightfire",
      ),
    ).toBe(true);
  });
});

describe("priceListingSharesItemIdentity", () => {
  it("rejects listings that introduce a different product lead with only a shared subtitle", () => {
    expect(
      priceListingSharesItemIdentity(
        "Black stories - Autour du monde",
        "Expéditions Autour du Monde",
      ),
    ).toBe(false);
  });

  it("keeps aligned franchise listings", () => {
    expect(
      priceListingSharesItemIdentity(
        "Black stories - Autour du monde",
        "Black Stories Autour du Monde",
      ),
    ).toBe(true);
  });

  it("treats Spider-Man and Spiderman as the same product identity", () => {
    expect(
      priceListingSharesItemIdentity(
        "Spider-Man 2: Enter Electro",
        "Spiderman 2 Enter Electro",
      ),
    ).toBe(true);
  });

  it("keeps padded magazine issues aligned with unpadded eBay titles", () => {
    expect(
      priceListingSharesItemIdentity(
        "Super Picsou Géant n°036",
        "SUPER PICSOU GEANT n°36*",
      ),
    ).toBe(true);
    expect(
      priceListingSharesItemIdentity(
        "Super Picsou Géant n°081",
        "Super Picsou Géant 81",
      ),
    ).toBe(true);
  });

  it("rejects Sirènes when the item is Black Stories Femmes Fatales", () => {
    expect(
      priceListingSharesItemIdentity(
        "Black Stories - Femmes Fatales",
        "Sirènes : femmes fatales",
      ),
    ).toBe(false);
  });

  it("rejects LEGO kit listings for a short game franchise title", () => {
    expect(
      priceListingSharesItemIdentity(
        "Minecraft",
        "LEGO Minecraft 21273 L'attaque du village de ballons Ghast",
      ),
    ).toBe(false);
  });

  it("keeps identity when the shelf item is itself a LEGO kit", () => {
    expect(
      priceListingSharesItemIdentity(
        "LEGO Minecraft 21273",
        "LEGO Minecraft 21273 L'attaque du village de ballons Ghast",
      ),
    ).toBe(true);
  });
});

describe("retailerCatalogSharesRequestedIdentity", () => {
  it("rejects Sirènes when the item is Black Stories Femmes Fatales", () => {
    expect(
      retailerCatalogSharesRequestedIdentity(
        "Black Stories - Femmes Fatales",
        "Sirènes : femmes fatales",
      ),
    ).toBe(false);
  });
});

describe("isNameOnlyRetailerTitleMatch", () => {
  it("accepte un titre quasi identique", () => {
    expect(isNameOnlyRetailerTitleMatch("Catan", "Catan")).toBe(true);
  });

  it("rejette La Maison du Lac vs La Maison des Souris", () => {
    expect(
      isNameOnlyRetailerTitleMatch("La Maison du Lac", "La Maison des Souris"),
    ).toBe(false);
  });

  it("rejette La Maison du Lac vs Ma Maison", () => {
    expect(isNameOnlyRetailerTitleMatch("La Maison du Lac", "Ma Maison")).toBe(
      false,
    );
  });

  it("accepte les couleurs FR/EN équivalentes", () => {
    expect(
      isNameOnlyRetailerTitleMatch("Pokemon Jaune", "Pokemon Yellow"),
    ).toBe(true);
  });

  it("rejette un sequel retailer (Part I vs Part II)", () => {
    expect(
      isNameOnlyRetailerTitleMatch(
        "The Last of Us Part I",
        "The Last of Us Part II PS4",
      ),
    ).toBe(false);
  });

  it("rejette Little Nightmares II quand seul le premier opus est demandé", () => {
    expect(
      isNameOnlyRetailerTitleMatch(
        "Little Nightmares",
        "Little Nightmares II PS4",
      ),
    ).toBe(false);
    expect(
      isNameOnlyRetailerTitleMatch(
        "Little Nightmares",
        "Little Nightmares PS4",
      ),
    ).toBe(true);
  });

  it("rejette Borderlands 3 quand Borderlands 1 GOTY est demandé", () => {
    expect(
      isNameOnlyRetailerTitleMatch(
        "Borderlands 1 - Game of the Year edition",
        "Borderlands 3 [Deluxe Edition]",
      ),
    ).toBe(false);
    expect(
      isNameOnlyRetailerTitleMatch("Borderlands 1", "Borderlands 3 PS4"),
    ).toBe(false);
  });
});
