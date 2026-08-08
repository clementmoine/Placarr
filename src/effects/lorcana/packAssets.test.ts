import { describe, expect, it, vi } from "vitest";

vi.mock("./cards-index.json", () => ({
  default: {
    languages: ["fr", "en"],
    cards: {
      "lorcana:1-42": {
        fr: {
          foilMask: "foil_mask.jpg",
          varnishMask: "varnish_mask.jpg",
          art: "art.jpg",
          thumb: "thumb.jpg",
        },
        en: {
          foilMask: "foil_mask.jpg",
          art: "art.jpg",
          thumb: "thumb.jpg",
        },
      },
      "lorcana:legacy-1": {
        foilMask: "foil_mask.jpg",
        art: "art.jpg",
      },
    },
  },
}));

import {
  packArtUrl,
  packFoilMaskUrl,
  packHasCard,
  preferPackUrl,
  withPackCardUrls,
} from "./packAssets";

describe("lorcana packAssets", () => {
  it("builds /foil/lorcana/cards/{print}/{lang}/ URLs", () => {
    expect(packHasCard("lorcana:1-42")).toBe(true);
    expect(packFoilMaskUrl("lorcana:1-42", "fr")).toBe(
      "/foil/lorcana/cards/lorcana%3A1-42/fr/foil_mask.jpg",
    );
    expect(packArtUrl("lorcana:1-42", "en")).toBe(
      "/foil/lorcana/cards/lorcana%3A1-42/en/art.jpg",
    );
    expect(packArtUrl("lorcana:1-42")).toBe(
      "/foil/lorcana/cards/lorcana%3A1-42/fr/art.jpg",
    );
  });

  it("falls back to legacy flat files under the print key", () => {
    expect(packArtUrl("lorcana:legacy-1")).toBe(
      "/foil/lorcana/cards/lorcana%3Alegacy-1/art.jpg",
    );
  });

  it("prefers pack over remote when indexed", () => {
    expect(
      preferPackUrl(packFoilMaskUrl("lorcana:1-42", "fr"), "https://cdn/mask.jpg"),
    ).toBe("/foil/lorcana/cards/lorcana%3A1-42/fr/foil_mask.jpg");
    expect(preferPackUrl(null, "https://cdn/mask.jpg")).toBe(
      "https://cdn/mask.jpg",
    );
  });

  it("rewrites print fields using the row language", () => {
    expect(
      withPackCardUrls({
        printKey: "lorcana:1-42",
        language: "en",
        imageUrl: "https://cdn/art.jpg",
        foilMaskUrl: "https://cdn/mask.jpg",
        varnishMaskUrl: "https://cdn/v.jpg",
        secondVarnishMaskUrl: "https://cdn/v2.jpg",
      }),
    ).toEqual({
      printKey: "lorcana:1-42",
      language: "en",
      imageUrl: "/foil/lorcana/cards/lorcana%3A1-42/en/art.jpg",
      thumbnailUrl: "/foil/lorcana/cards/lorcana%3A1-42/en/thumb.jpg",
      foilMaskUrl: "/foil/lorcana/cards/lorcana%3A1-42/en/foil_mask.jpg",
      varnishMaskUrl: "https://cdn/v.jpg",
      secondVarnishMaskUrl: "https://cdn/v2.jpg",
    });

    expect(
      withPackCardUrls({
        printKey: "lorcana:9-999",
        foilMaskUrl: "https://cdn/mask.jpg",
      }),
    ).toEqual({
      printKey: "lorcana:9-999",
      foilMaskUrl: "https://cdn/mask.jpg",
    });
  });
});
