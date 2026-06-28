import { describe, expect, it } from "vitest";
import {
  scoreDisplayTitle,
  scoreMetadataDisplayTitle,
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
  });

  describe("scoreMetadataDisplayTitle", () => {
    it("scores standard Latin titles as 0 or higher", () => {
      const score = scoreMetadataDisplayTitle(
        "KINGDOM HEARTS: ORCHESTRA - World Of Tres",
      );
      expect(score).toBe(0);
    });

    it("prefers French catalog spellings over listing noise", () => {
      const french = scoreMetadataDisplayTitle("Les Lapins Crétins : Retour vers le passé");
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
  });
});
