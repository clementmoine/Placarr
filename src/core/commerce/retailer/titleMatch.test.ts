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

  it("rejects game listings for a hardware console title", () => {
    expect(
      priceListingSharesItemIdentity(
        "Nintendo Switch OLED Édition The Legend of Zelda",
        "The Legend of Zelda",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
    expect(
      priceListingSharesItemIdentity("Xbox Series X", "Halo Infinite", {
        shelfType: "hardware",
      }),
    ).toBe(false);
  });

  it("keeps hardware console identity with catalog chrome", () => {
    expect(
      priceListingSharesItemIdentity(
        "Nintendo Switch OLED",
        "Nintendo Switch OLED Model",
        { shelfType: "hardware" },
      ),
    ).toBe(true);
  });

  it("rejects Switch Sports / Mini NES / PS5 when shelf is hardware", () => {
    expect(
      priceListingSharesItemIdentity(
        "Nintendo Switch",
        "Nintendo Switch Sports",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
    expect(
      priceListingSharesItemIdentity(
        "Nintendo NES",
        "Nintendo Classic Mini NES 2016",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
    expect(
      priceListingSharesItemIdentity(
        "PlayStation",
        "Sony PlayStation 5 Slim Digital",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
  });

  it("rejects Nintendogs / DSi / 3DS listings for a bare Nintendo DS console", () => {
    expect(
      priceListingSharesItemIdentity(
        "Nintendo DS",
        "Nintendogs + cats Caniche Toy & ses nouveaux amis Nintendo 3DS",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
    expect(
      priceListingSharesItemIdentity("Nintendo DS", "Nintendo DSi - Noir", {
        shelfType: "hardware",
      }),
    ).toBe(false);
    expect(
      priceListingSharesItemIdentity(
        "Nintendo DS",
        "Nintendo 3DS (+ Nintendogs + Cats: Golden Retriever)",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
    expect(
      priceListingSharesItemIdentity(
        "Nintendo DS",
        "Black Nintendo DS System",
        { shelfType: "hardware" },
      ),
    ).toBe(true);
  });

  it("keeps Back Market console + manette bundles for a bare NES", () => {
    expect(
      priceListingSharesItemIdentity(
        "Nintendo NES",
        "Nintendo NES - Manette Gris",
        { shelfType: "hardware" },
      ),
    ).toBe(true);
  });

  it("rejects controller listings for a hardware console title", () => {
    expect(
      priceListingSharesItemIdentity(
        "Nintendo GameCube Black",
        "GameCube Controller Black",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
    expect(
      priceListingSharesItemIdentity(
        "Nintendo GameCube Black",
        "Nintendo GameCube Controller - SS Bros Ultimate Edition",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
  });
  it("treats gold/platinum edition chrome as non-identity on software shelves", () => {
    expect(
      priceListingSharesItemIdentity(
        "The Last of Us Part II",
        "The Last of Us Part II Gold Edition PS4",
      ),
    ).toBe(true);
    expect(
      priceListingSharesItemIdentity(
        "Final Fantasy VII Remake",
        "Final Fantasy VII Remake Platinum Edition",
      ),
    ).toBe(true);
  });

  it("keeps platform tokens as hardware identity", () => {
    expect(
      priceListingSharesItemIdentity("Xbox Series X", "Xbox Series X Console", {
        shelfType: "hardware",
      }),
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

  it("rejette Switch Sports en name-only hardware", () => {
    expect(
      isNameOnlyRetailerTitleMatch(
        "Nintendo Switch",
        "Nintendo Switch Sports",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
  });

  it("rejette Nintendogs en name-only pour la console Nintendo DS", () => {
    expect(
      isNameOnlyRetailerTitleMatch(
        "Nintendo DS",
        "Nintendogs + cats Caniche Toy & ses nouveaux amis Nintendo 3DS",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
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

  it("rejette jaune≠yellow sans alias provider", () => {
    expect(
      isNameOnlyRetailerTitleMatch("Pokemon Jaune", "Pokemon Yellow"),
    ).toBe(false);
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
