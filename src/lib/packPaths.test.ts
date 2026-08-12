import { describe, expect, it } from "vitest";

import {
  assetsCardUrl,
  cardDiskIdFromBundleStem,
  cardDiskIdFromPrintKey,
  pokemonCardTextureUrl,
  pokemonFaceFileFromTex,
} from "./packPaths";

describe("packPaths", () => {
  it("maps Lorcana printKey to set/lang/card", () => {
    expect(cardDiskIdFromPrintKey("lorcana:q2-14", "fr")).toEqual({
      set: "q2",
      lang: "fr",
      card: "14",
    });
    expect(cardDiskIdFromPrintKey("lorcana:1-20-p1", "en")).toEqual({
      set: "1",
      lang: "en",
      card: "20-p1",
    });
  });

  it("maps Live bundle stems", () => {
    expect(cardDiskIdFromBundleStem("me5_fr_045")).toEqual({
      set: "me5",
      lang: "fr",
      card: "045",
    });
    expect(cardDiskIdFromBundleStem("swsh10-5_fr_011")).toEqual({
      set: "swsh10-5",
      lang: "fr",
      card: "011",
    });
  });

  it("builds assets card URLs and canonical face names", () => {
    expect(assetsCardUrl("lorcana", { set: "1", lang: "fr", card: "1" }, "art.jpg")).toBe(
      "/assets/lorcana/cards/1/fr/1/art.jpg",
    );
    expect(pokemonFaceFileFromTex("me5_fr_045", "me5_wp_fr_045")).toBe("mask.webp");
    expect(pokemonFaceFileFromTex("bw10_fr_001", "bw10_wp_ph_fr_001")).toBe(
      "mask-ph.webp",
    );
    expect(pokemonCardTextureUrl("me5_fr_045", "me5_fr_045")).toBe(
      "/assets/pokemon/cards/me5/fr/045/art.webp",
    );
  });
});
