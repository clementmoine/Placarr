import { describe, expect, it } from "vitest";

import { isListingMetadataSegment } from "@/core/identify/listingMetadata";
import {
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
});
