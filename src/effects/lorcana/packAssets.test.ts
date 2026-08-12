import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/foilMetaLoad", () => ({
  loadCardsIndexJson: () => ({
    version: 1,
    pack: "lorcana",
    cards: {
      "lorcana:1-42": {
        set: "1",
        card: "42",
        langs: {
          fr: {
            mask: "mask.jpg",
            varnishMask: "varnish_mask.jpg",
            art: "art.jpg",
            thumb: "thumb.jpg",
          },
          en: {
            mask: "mask.jpg",
            art: "art.jpg",
            thumb: "thumb.jpg",
          },
        },
      },
    },
  }),
}));

import {
  packArtUrl,
  packFoilMaskUrl,
  packHasCard,
  preferPackUrl,
  withPackCardUrls,
} from "./packAssets";

describe("lorcana packAssets", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("builds /assets/lorcana/cards/{set}/{lang}/{card}/ URLs", () => {
    expect(packHasCard("lorcana:1-42")).toBe(true);
    expect(packFoilMaskUrl("lorcana:1-42", "fr")).toBe(
      "/assets/lorcana/cards/1/fr/42/mask.jpg",
    );
    expect(packArtUrl("lorcana:1-42", "fr")).toBe(
      "/assets/lorcana/cards/1/fr/42/art.jpg",
    );
  });

  it("preferPackUrl keeps remote when pack missing", () => {
    expect(
      preferPackUrl(packFoilMaskUrl("lorcana:1-42", "fr"), "https://cdn/mask.jpg"),
    ).toBe("/assets/lorcana/cards/1/fr/42/mask.jpg");
    expect(preferPackUrl(null, "https://cdn/mask.jpg")).toBe(
      "https://cdn/mask.jpg",
    );
  });

  it("withPackCardUrls overlays local pack URLs", () => {
    expect(
      withPackCardUrls({
        printKey: "lorcana:1-42",
        language: "fr",
        imageUrl: "https://cdn/art.jpg",
        foilMaskUrl: "https://cdn/mask.jpg",
      }),
    ).toMatchObject({
      imageUrl: "/assets/lorcana/cards/1/fr/42/art.jpg",
      foilMaskUrl: "/assets/lorcana/cards/1/fr/42/mask.jpg",
    });
  });
});
