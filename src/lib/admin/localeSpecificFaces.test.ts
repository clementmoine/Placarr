import { describe, expect, it } from "vitest";

import {
  buildLocaleSpecificFacesFromIndex,
  localeSpecificFaceKey,
} from "./localeSpecificFaces";

describe("localeSpecificFaces", () => {
  it("marks prints that already have art in two catalogue locales", () => {
    const doc = buildLocaleSpecificFacesFromIndex(
      {
        version: 1,
        pack: "naruto/mythos",
        generatedAt: "2026-09-16",
        cards: {
          "mythos:ks1-0001": {
            set: "ks1",
            card: "0001",
            langs: {
              fr: { art: "art.narutomythos.webp" },
              en: { art: "art.narutomythos.webp" },
            },
          },
          "mythos:ss2-0001": {
            set: "ss2",
            card: "0001",
            langs: {
              en: { art: "art.official.webp" },
            },
          },
        },
      },
      ["fr", "en"],
    );
    expect(doc.faces).toEqual([{ set: "ks1", card: "0001" }]);
    expect(localeSpecificFaceKey("ks1", "0001")).toBe(`ks1\u00000001`);
  });
});
