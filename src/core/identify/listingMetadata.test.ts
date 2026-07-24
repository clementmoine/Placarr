import { describe, expect, it } from "vitest";

import { isListingMetadataSegment } from "@/core/identify/listingMetadata";
import {
  listingAddsUnrequestedControllerAccessory,
  listingAddsUnrequestedConsoleSystem,
  listingLooksLikeGameAccessory,
  listingLooksLikeMerchAccessory,
  listingLooksLikeNonBookProduct,
} from "@/core/identify/titleUtils";

describe("isListingMetadataSegment", () => {
  it.each([
    "Nintendo",
    "Wii",
    "PAL FR",
    "complet",
    "sans notice",
    "jeux wii",
    "nintendo switch",
    "brand new",
    "jeu video",
  ])("treats %s as metadata", (segment) => {
    expect(isListingMetadataSegment(segment)).toBe(true);
  });

  it.each(["Mario Kart", "Sports Island", "The Legend of Zelda"])(
    "keeps product segment %s",
    (segment) => {
      expect(isListingMetadataSegment(segment)).toBe(false);
    },
  );

  it("treats format-token combos as metadata", () => {
    expect(isListingMetadataSegment("album cd")).toBe(true);
    expect(isListingMetadataSegment("cd album")).toBe(true);
  });

  it("treats generation / era chrome as metadata", () => {
    expect(isListingMetadataSegment("1ere generation")).toBe(true);
    expect(isListingMetadataSegment("first gen")).toBe(true);
    expect(isListingMetadataSegment("vintage")).toBe(true);
  });

  it("treats region compounds as metadata", () => {
    expect(isListingMetadataSegment("pal fr")).toBe(true);
    expect(isListingMetadataSegment("version francaise")).toBe(true);
    expect(isListingMetadataSegment("region free")).toBe(true);
  });
});

describe("listing merch taxonomies", () => {
  it("detects device cases as merch", () => {
    expect(
      listingLooksLikeMerchAccessory(
        "Coque compatible pour Ipod TOUCH 7 MANGA NARUTO 51",
      ),
    ).toBe(true);
  });

  it("detects TCG as non-book product", () => {
    expect(listingLooksLikeNonBookProduct("Pokemon Booster ETB")).toBe(true);
  });

  it("detects artbook as game companion media", () => {
    expect(listingLooksLikeGameAccessory("Zelda Artbook")).toBe(true);
  });

  it("treats DualSense as merch on games shelves but identity on hardware", () => {
    const title = "Manette DualSense PS5 Midnight Black";
    expect(listingLooksLikeMerchAccessory(title)).toBe(true);
    expect(listingLooksLikeGameAccessory(title)).toBe(true);
    expect(
      listingLooksLikeMerchAccessory(title, { shelfType: "hardware" }),
    ).toBe(false);
    expect(
      listingLooksLikeGameAccessory(title, { shelfType: "hardware" }),
    ).toBe(false);
  });

  it("keeps posters as merch even on hardware shelves", () => {
    expect(
      listingLooksLikeMerchAccessory("Poster Zelda Tears of the Kingdom", {
        shelfType: "hardware",
      }),
    ).toBe(true);
  });

  it("detects console repair kits and docks as merch", () => {
    expect(
      listingLooksLikeMerchAccessory(
        "Kit restauration condensateurs - Nintendo NES",
      ),
    ).toBe(true);
    expect(
      listingLooksLikeMerchAccessory(
        "Station D'accueil Axagon Adsa-sn Noir Plug And Play Uasp",
      ),
    ).toBe(true);
    expect(
      listingLooksLikeMerchAccessory("Nintendo Switch OLED", {
        shelfType: "hardware",
      }),
    ).toBe(false);
  });

  it("rejects a controller listing for a console request on hardware", () => {
    expect(
      listingAddsUnrequestedControllerAccessory(
        "Nintendo GameCube Black",
        "GameCube Controller Black",
        { shelfType: "hardware" },
      ),
    ).toBe(true);
    expect(
      listingAddsUnrequestedControllerAccessory(
        "Manette DualSense PS5",
        "DualSense Wireless Controller",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
  });

  it("allows console + included-pad marketplace bundles for a bare console", () => {
    expect(
      listingAddsUnrequestedControllerAccessory(
        "Nintendo NES",
        "Nintendo NES - Manette Gris",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
    expect(
      listingAddsUnrequestedControllerAccessory(
        "Nintendo Switch",
        "Nintendo Switch with Gray Joy-Con",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
  });

  it("allows a console bundle for a platform+Joy-Con shelf name on hardware", () => {
    expect(
      listingAddsUnrequestedConsoleSystem(
        "Nintendo Switch Joycon Gris",
        "Nintendo Switch with Gray Joy-Con",
        { shelfType: "hardware" },
      ),
    ).toBe(false);
    expect(
      listingAddsUnrequestedConsoleSystem(
        "Joy-Con Gray",
        "Nintendo Switch with Gray Joy-Con",
        { shelfType: "hardware" },
      ),
    ).toBe(true);
  });

  it("treats amiibo as merch on games but identity on toys", () => {
    const title = "Amiibo Link Tears of the Kingdom";
    expect(listingLooksLikeMerchAccessory(title)).toBe(true);
    expect(
      listingLooksLikeMerchAccessory(title, { shelfType: "toys" }),
    ).toBe(false);
  });

  it("treats TCG boosters as identity on tcg shelves", () => {
    const title = "Pokemon Booster ETB";
    expect(listingLooksLikeNonBookProduct(title)).toBe(true);
    expect(
      listingLooksLikeNonBookProduct(title, { shelfType: "tcg" }),
    ).toBe(false);
  });
});
