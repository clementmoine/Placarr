import { describe, expect, it } from "vitest";
import {
  scoreDisplayTitle,
  scoreMetadataDisplayTitle,
  pickBestCatalogDisplayTitle,
  hasCatalogReferenceListingNoise,
} from "./displayScore";

describe("displayTitleScore", () => {
  describe("scoreDisplayTitle", () => {
    it("assigns standard score to Latin titles", () => {
      const score = scoreDisplayTitle(
        "KINGDOM HEARTS: ORCHESTRA - World Of Tres",
      );
      expect(score).toBeGreaterThan(0);
    });

    it("penalizes CJK character titles compared to structurally equivalent Latin titles", () => {
      const latinScore = scoreDisplayTitle(
        "Yoko Shimomura - Kingdom Hearts Orchestra",
      );
      const cjkScore = scoreDisplayTitle("下村陽子 - Kingdom Hearts Orchestra");
      expect(cjkScore).toBe(latinScore - 200);
    });

    it("drives language preference from the locale options, not hardcoded French", () => {
      const french = "Le Trésor du Dragon";
      const english = "The Treasure of the Dragon";

      // Défaut applicatif : ordre fr-first.
      expect(scoreDisplayTitle(french)).toBeGreaterThan(
        scoreDisplayTitle(english),
      );

      // Locale UI anglaise : la préférence s'inverse via les options,
      // sans aucun littéral de langue dans le scorer.
      const enFirst = { languageOrder: ["en", "fr"] } as const;
      expect(scoreDisplayTitle(english, false, enFirst)).toBeGreaterThan(
        scoreDisplayTitle(french, false, enFirst),
      );
    });
  });

  describe("scoreMetadataDisplayTitle", () => {
    it("scores standard Latin titles as 0 or higher", () => {
      const score = scoreMetadataDisplayTitle(
        "KINGDOM HEARTS: ORCHESTRA - World Of Tres",
      );
      expect(score).toBe(0);
    });

    it("prefers French catalog spellings over listing noise", () => {
      const french = scoreMetadataDisplayTitle(
        "Les Lapins Crétins : Retour vers le passé",
      );
      const noisy = scoreMetadataDisplayTitle(
        "Les Lapins Crétins jeu video complet pal fr",
      );
      expect(french).toBeGreaterThan(noisy);
    });

    it("penalizes CJK character titles in metadata titles", () => {
      const cjkScore = scoreMetadataDisplayTitle(
        "下村陽子 - KINGDOM HEARTS Orchestra -World of Tres-",
      );
      expect(cjkScore).toBe(-200);
    });

    it("follows the preferred language from the locale options", () => {
      const french = "Le Trésor du Dragon";
      const english = "The Treasure of the Dragon";

      expect(scoreMetadataDisplayTitle(french)).toBeGreaterThan(
        scoreMetadataDisplayTitle(english),
      );

      const enFirst = { languageOrder: ["en", "fr"] } as const;
      expect(scoreMetadataDisplayTitle(english, enFirst)).toBeGreaterThan(
        scoreMetadataDisplayTitle(french, enFirst),
      );
    });

    it("prefers editorial titles over retailer reference codes", () => {
      const clean = scoreDisplayTitle("Black Stories - Morts de Rire");
      const noisy = scoreDisplayTitle(
        "Black Stories Morts de Rire FR KikiGagne?KIKIBS06F",
      );
      expect(clean).toBeGreaterThan(noisy);
    });
  });

  describe("pickBestCatalogDisplayTitle", () => {
    it("picks the cleanest alias among retailer listing variants", () => {
      const picked = pickBestCatalogDisplayTitle([
        "Black Stories Morts de Rire FR KikiGagne?KIKIBS06F",
        "Black Stories - Morts de Rire",
        "Black Stories : Morts de Rire",
      ]);
      expect(picked).not.toBe(
        "Black Stories Morts de Rire FR KikiGagne?KIKIBS06F",
      );
      expect([
        "Black Stories - Morts de Rire",
        "Black Stories : Morts de Rire",
      ]).toContain(picked);
    });
  });

  describe("hasCatalogReferenceListingNoise", () => {
    it("detects retailer SKU tokens in listing titles", () => {
      expect(
        hasCatalogReferenceListingNoise(
          "Black Stories Morts de Rire FR KikiGagne?KIKIBS06F",
        ),
      ).toBe(true);
      expect(
        hasCatalogReferenceListingNoise("Black Stories - Morts de Rire"),
      ).toBe(false);
    });
  });
});
