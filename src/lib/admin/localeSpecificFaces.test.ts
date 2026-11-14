import { describe, expect, it } from "vitest";

import {
  buildLocaleSpecificFacesFromIndex,
  entryIsLocaleSpecificFace,
  localeSpecificFaceKey,
} from "./localeSpecificFaces";

describe("localeSpecificFaces", () => {
  it("marks Carddass FR+JA dual faces so catalogue won't borrow JA onto FR", () => {
    const doc = buildLocaleSpecificFacesFromIndex(
      {
        version: 1,
        pack: "naruto/carddass",
        generatedAt: "2026-09-21",
        cards: {
          "naruto:ni-0001": {
            set: "ninja",
            card: "ni0001",
            langs: {
              fr: { art: "art.carddass.jpg" },
              ja: { art: "art.suruga.jpg" },
            },
          },
          "naruto:ni-0349": {
            set: "ninja",
            card: "ni0349",
            langs: {
              ja: { art: "art.suruga.jpg" },
            },
          },
        },
      },
      ["fr", "ja", "en"],
    );
    expect(doc.faces).toEqual([{ set: "ninja", card: "ni0001" }]);
  });

  it("marks FR title + JA art (no FR scan) when countLocalizedNames", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/carddass",
      generatedAt: "2026-09-21",
      cards: {
        "naruto:s2-ta0090": {
          set: "mission",
          card: "ta0090",
          langs: {
            fr: { name: "Le don de la copie" },
            ja: { art: "art.suruga.jpg", name: "コピー能力" },
          },
        },
        "naruto:maki5-ta0090": {
          set: "mission",
          card: "ta0090",
          langs: {
            ja: { art: "art.suruga.jpg", name: "コピー能力" },
          },
        },
      },
    };
    expect(
      buildLocaleSpecificFacesFromIndex(index, ["fr", "ja", "en"]).faces,
    ).toEqual([]);
    expect(
      buildLocaleSpecificFacesFromIndex(
        index,
        ["fr", "ja", "en"],
        undefined,
        { countLocalizedNames: true },
      ).faces,
    ).toEqual([{ set: "mission", card: "ta0090" }]);
    expect(
      entryIsLocaleSpecificFace(
        index.cards["naruto:s2-ta0090"]!,
        ["fr", "ja", "en"],
        { countLocalizedNames: true },
      ),
    ).toBe(true);
  });
});
