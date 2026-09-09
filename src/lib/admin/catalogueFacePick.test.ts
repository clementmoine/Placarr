import { describe, expect, it } from "vitest";

import {
  catalogueFaceSlotScore,
  pickBestCatalogueFaceSlot,
  resolveCatalogueFace,
} from "./catalogueFacePick";

describe("catalogueFacePick", () => {
  it("prefère la plus grande face pour un tirage neutre", () => {
    const entry = {
      set: "nr",
      card: "0010",
      langs: {
        fr: {},
        en: { art: "art.arcade.jpg", artW: 600, artH: 840 },
        it: { art: "art.imadoki.jpg", artW: 240, artH: 330 },
      },
    };
    const best = pickBestCatalogueFaceSlot(entry, ["en", "fr", "it"]);
    expect(best?.lang).toBe("en");
    expect(catalogueFaceSlotScore(best!.files)).toBeGreaterThan(
      catalogueFaceSlotScore(entry.langs.it!),
    );
  });

  it("préfère un scan éditeur à une photo Coleka reflétée à résolution proche", () => {
    const entry = {
      set: "ff",
      card: "0006",
      langs: {
        fr: { art: "art.coleka.webp", artW: 750, artH: 1096 },
        en: { art: "art.arcadegamecards.jpg", artW: 740, artH: 1032 },
        it: { art: "art.imadoki.jpg", artW: 244, artH: 342 },
      },
    };
    const face = resolveCatalogueFace({
      entry,
      tileLang: "fr",
      tileFiles: entry.langs.fr!,
      catalogueLocales: ["en", "fr", "it"],
      languageSpecific: false,
      bestFaceAcrossLocales: true,
    });
    expect(face.artLang).toBe("en");
    expect(face.file).toBe("art.arcadegamecards.jpg");
  });

  it("emprunte la meilleure face cross-locale quand le tirage est neutre", () => {
    const entry = {
      set: "sd",
      card: "0006",
      langs: {
        fr: { art: "art.coleka.webp", artW: 1500, artH: 1068 },
        it: { art: "art.imadoki.jpg", artW: 240, artH: 330 },
      },
    };
    const face = resolveCatalogueFace({
      entry,
      tileLang: "it",
      tileFiles: entry.langs.it!,
      catalogueLocales: ["en", "fr", "it"],
      languageSpecific: false,
      bestFaceAcrossLocales: true,
    });
    expect(face.artLang).toBe("fr");
    expect(face.file).toBe("art.coleka.webp");
  });

  it("garde la locale du tile quand le recto est language-specific", () => {
    const entry = {
      set: "nr",
      card: "0068",
      langs: {
        fr: {},
        it: { art: "art.imadoki.jpg", artW: 1500, artH: 1068 },
      },
    };
    const face = resolveCatalogueFace({
      entry,
      tileLang: "fr",
      tileFiles: entry.langs.fr!,
      catalogueLocales: ["en", "fr", "it"],
      languageSpecific: true,
      bestFaceAcrossLocales: true,
    });
    expect(face.file).toBeNull();
    expect(face.artLang).toBe("fr");
  });

  it("n'emprunte pas l'EN sur nr-0066 FR — bandeau « GROUPE DE KONOHAMARU »", () => {
    const entry = {
      set: "nr",
      card: "0066",
      langs: {
        fr: { art: "art.coleka.webp", artW: 1062, artH: 1500 },
        en: { art: "art.arcadegamecards.jpg", artW: 748, artH: 1032 },
        it: { art: "art.imadoki.jpg", artW: 245, artH: 329 },
      },
    };
    const face = resolveCatalogueFace({
      entry,
      tileLang: "fr",
      tileFiles: entry.langs.fr!,
      catalogueLocales: ["en", "fr", "it"],
      languageSpecific: true,
      bestFaceAcrossLocales: true,
    });
    expect(face.artLang).toBe("fr");
    expect(face.file).toBe("art.coleka.webp");
  });

  it("n'emprunte pas l'EN sur sd-0002 FR — die-cut US ≠ EU", () => {
    const entry = {
      set: "sd",
      card: "0002",
      langs: {
        fr: { art: "art.coleka.webp", artW: 1077, artH: 1500 },
        en: { art: "art.reconstructed.webp", artW: 1072, artH: 1446 },
        it: { art: "art.imadoki.jpg", artW: 242, artH: 332 },
      },
    };
    const face = resolveCatalogueFace({
      entry,
      tileLang: "fr",
      tileFiles: entry.langs.fr!,
      catalogueLocales: ["en", "fr", "it"],
      languageSpecific: true,
      bestFaceAcrossLocales: true,
    });
    expect(face.artLang).toBe("fr");
    expect(face.file).toBe("art.coleka.webp");
  });

  it("n'emprunte pas le FR sur sd-0002 EN — die-cut EU ≠ US", () => {
    const entry = {
      set: "sd",
      card: "0002",
      langs: {
        fr: { art: "art.coleka.webp", artW: 1077, artH: 1500 },
        en: { art: "art.reconstructed.webp", artW: 1072, artH: 1446 },
      },
    };
    const face = resolveCatalogueFace({
      entry,
      tileLang: "en",
      tileFiles: entry.langs.en!,
      catalogueLocales: ["en", "fr", "it"],
      languageSpecific: true,
      bestFaceAcrossLocales: true,
    });
    expect(face.artLang).toBe("en");
    expect(face.file).toBe("art.reconstructed.webp");
  });

  it("emprunte le recto EN sur pn-0001 FR — promo US sans édition locale", () => {
    const entry = {
      set: "pn",
      card: "0001",
      langs: {
        en: { art: "art.reconstructed.webp", artW: 1600, artH: 1600 },
        fr: {},
        it: {},
      },
    };
    const face = resolveCatalogueFace({
      entry,
      tileLang: "fr",
      tileFiles: entry.langs.fr!,
      catalogueLocales: ["en", "fr", "it"],
      languageSpecific: false,
      bestFaceAcrossLocales: true,
    });
    expect(face.artLang).toBe("en");
    expect(face.file).toBe("art.reconstructed.webp");
  });

  it("emprunte le recto EN sur bl-0002 IT — pastille « GROUP 7 » identique sur GS/BL", () => {
    const entry = {
      set: "bl",
      card: "0002",
      langs: {
        en: { art: "art.arcadegamecards.jpg", artW: 736, artH: 1032 },
        fr: { art: "art.coleka.webp", artW: 1067, artH: 1500 },
        it: { art: "art.imadoki.jpg", artW: 239, artH: 333 },
      },
    };
    const face = resolveCatalogueFace({
      entry,
      tileLang: "it",
      tileFiles: entry.langs.it!,
      catalogueLocales: ["en", "fr", "it"],
      languageSpecific: false,
      bestFaceAcrossLocales: true,
    });
    expect(face.artLang).toBe("en");
    expect(face.file).toBe("art.arcadegamecards.jpg");
  });

  it("n'emprunte pas l'IT sur ff-0002 FR — bandeau « DEMON-RENARD »", () => {
    const entry = {
      set: "ff",
      card: "0002",
      langs: {
        fr: {},
        it: { art: "art.imadoki.jpg", artW: 244, artH: 334 },
        en: { name: "Naruto - Fox Spirit" },
      },
    };
    const face = resolveCatalogueFace({
      entry,
      tileLang: "fr",
      tileFiles: entry.langs.fr!,
      catalogueLocales: ["en", "fr", "it"],
      languageSpecific: true,
      bestFaceAcrossLocales: true,
    });
    expect(face.artLang).toBe("fr");
    expect(face.file).toBeNull();
  });

  it("préfère AnimeCollection HD à Coleka sur la même locale (score)", () => {
    expect(
      catalogueFaceSlotScore({
        art: "art.animecollection.jpg",
        artW: 727,
        artH: 1024,
      }),
    ).toBeGreaterThan(
      catalogueFaceSlotScore({
        art: "art.coleka.webp",
        artW: 750,
        artH: 1096,
      }),
    );
  });
});
