import { describe, expect, it } from "vitest";

import {
  buildLocaleSpecificFacesFromIndex,
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
});
