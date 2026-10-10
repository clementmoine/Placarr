import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { decodeNarutoHtmlEntities, foldNarutoCardsIndex, foldNarutoCatalogueRecords, isImplausibleNarutoTitle, pickBetterNarutoTitle, planNarutoCardMove, planNarutoCanonicalDiskRename, THUMB_RATIO_TOLERANCE, correctedThumbSize, thumbRatioDeviation } from ".";
import { narutoDiskCardId } from "../identity";
import { migrateNarutoVcBacksToCorrectedArt } from "../scrape/scrapeCards";

// —— foldNarutoIndex ——
{
  describe("isImplausibleNarutoTitle", () => {
    it("rejects scrape leftovers and keeps real names", () => {
      expect(isImplausibleNarutoTitle("qui")).toBe(true);
      expect(isImplausibleNarutoTitle("Carte NI-064")).toBe(true);
      expect(isImplausibleNarutoTitle("Kakashi Hatake")).toBe(false);
      expect(isImplausibleNarutoTitle("Ino")).toBe(false);
    });
  });

  describe("decodeNarutoHtmlEntities", () => {
    it("cleans aria-label leftovers like Let&#x27;s", () => {
      expect(decodeNarutoHtmlEntities("Let&#x27;s Take it Outside")).toBe(
        "Let's Take it Outside",
      );
      expect(
        pickBetterNarutoTitle(
          "Let&#x27;s Take it Outside",
          "Let's Take it Outside",
        ),
      ).toBe("Let's Take it Outside");
    });
  });

  describe("foldNarutoCardsIndex", () => {
    it("collapses s6-ni064 onto the retail Kakashi print", () => {
      const folded = foldNarutoCardsIndex({
        version: 1,
        pack: "naruto/carddass",
        generatedAt: "2026-01-01T00:00:00.000Z",
        cards: {
          "naruto:ni-0064": {
            set: "ninja",
            card: "ni0064",
            name: "Kakashi Hatake",
            rarity: "holo",
            langs: {
              fr: { name: "Kakashi Hatake", art: "art.jpg" },
              it: { name: "Kakashi Hatake" },
            },
          },
          "naruto:s6-ni064": {
            set: "s6",
            card: "ni064",
            name: "qui",
            langs: { fr: { name: "qui", printed: false } },
          },
        },
      });
      expect(Object.keys(folded.cards)).toEqual(["naruto:ni-0064"]);
      const entry = folded.cards["naruto:ni-0064"];
      expect(entry?.name).toBe("Kakashi Hatake");
      expect(entry?.langs.fr).toMatchObject({
        name: "Kakashi Hatake",
        art: "art.jpg",
      });
      expect(entry?.langs.fr?.printed).toBeUndefined();
      expect(entry?.langs.it?.name).toBe("Kakashi Hatake");
    });

    it("collapses an unpadded ni-086 stub onto ni-0086", () => {
      const folded = foldNarutoCardsIndex({
        version: 1,
        pack: "naruto/carddass",
        generatedAt: "2026-01-01T00:00:00.000Z",
        cards: {
          "naruto:ni-0086": {
            set: "ninja",
            card: "ni0086",
            name: "Sasuke Uchiwa",
            langs: { fr: { name: "Sasuke Uchiwa", art: "art.jpg" } },
          },
          "naruto:ni-086": {
            set: "s6",
            card: "ni086",
            name: "Sasuke Uchiwa",
            langs: { fr: { name: "Sasuke Uchiwa", printed: false } },
          },
        },
      });
      expect(Object.keys(folded.cards)).toEqual(["naruto:ni-0086"]);
      expect(folded.cards["naruto:ni-0086"]?.langs.fr).toMatchObject({
        name: "Sasuke Uchiwa",
        art: "art.jpg",
      });
      expect(folded.cards["naruto:ni-0086"]?.langs.fr?.printed).toBeUndefined();
    });
  });

  describe("foldNarutoCatalogueRecords", () => {
    it("drops the old series key and the junk FR title", () => {
      const folded = foldNarutoCatalogueRecords({
        prints: [
          {
            printKey: "naruto:ni-0064",
            setCode: "s2",
            number: "ni0064",
            cardType: "ni",
            family: "ninja",
          },
          {
            printKey: "naruto:s6-ni064",
            setCode: "s6",
            number: "ni064",
            cardType: "ni",
          },
        ],
        titles: [
          {
            printKey: "naruto:ni-0064",
            lang: "fr",
            fullName: "Kakashi Hatake",
          },
          {
            printKey: "naruto:s6-ni064",
            lang: "fr",
            fullName: "qui",
          },
        ],
        assets: [
          {
            printKey: "naruto:ni-0064",
            lang: "fr",
            art: "art.jpg",
          },
        ],
      });
      expect(folded.prints.map((p) => p.printKey)).toEqual(["naruto:ni-0064"]);
      expect(folded.prints[0]?.setCode).toBe("s2");
      expect(folded.titles).toEqual([
        {
          printKey: "naruto:ni-0064",
          lang: "fr",
          fullName: "Kakashi Hatake",
          rarity: null,
        },
      ]);
      expect(folded.assets[0]?.printed).not.toBe(false);
    });

    it("unionne setCodes multi-série sans inventer s6", () => {
      const folded = foldNarutoCatalogueRecords({
        prints: [
          {
            printKey: "naruto:ni-0049",
            setCode: "s1",
            setCodes: ["s1", "s5"],
            number: "ni0049",
            cardType: "ni",
          },
          {
            printKey: "naruto:ni-0049",
            setCode: "s5",
            number: "ni0049",
            cardType: "ni",
          },
        ],
      });
      expect(folded.prints).toHaveLength(1);
      expect(folded.prints[0]?.setCode).toBe("s1");
      expect(folded.prints[0]?.setCodes).toEqual(["s1", "s5"]);
    });
  });
}

// —— migrateCardLayout ——
{
  describe("planNarutoCardMove", () => {
    it("lifts series folders onto family / printed id / lang", () => {
      expect(planNarutoCardMove("s1", "fr", "ni001")).toEqual({
        fromRel: "s1/fr/ni001",
        toRel: "ninja/ni0001/fr",
        appearanceSet: "s1",
        lang: "fr",
        diskId: "ni0001",
        family: "ninja",
      });
      expect(planNarutoCardMove("s1", "en", "n001")?.toRel).toBe(
        "ninja/n0001/en",
      );
      expect(planNarutoCardMove("s28", "fr", "n1650")?.toRel).toBe(
        "ninja/n1650/fr",
      );
      expect(planNarutoCardMove("s6", "it", "ta226")?.toRel).toBe(
        "mission/ta0226/it",
      );
      expect(planNarutoCardMove("s6", "jap", "ni255")?.lang).toBe("ja");
      expect(planNarutoCardMove("promo", "fr", "ni023")?.toRel).toBe(
        "ninja/ni0023-promo/fr",
      );
      expect(planNarutoCardMove("promo", "fr", "pr011")?.toRel).toBe(
        "promo/pr0011/fr",
      );
      expect(planNarutoCardMove("promo", "ja", "prni0001")?.toRel).toBe(
        "promo/prni0001/ja",
      );
      expect(narutoDiskCardId("PR-忍-1", "promo")).toBe("prni0001");
      expect(planNarutoCardMove("s6", "en", "n0097-us")?.toRel).toBe(
        "ninja/nus0097/en",
      );
    });

    it("renames a leftover n0097-us folder onto the US prefix", () => {
      expect(planNarutoCanonicalDiskRename("ninja", "n0097-us", "en")).toEqual({
        fromRel: "ninja/n0097-us/en",
        toRel: "ninja/nus0097/en",
        appearanceSet: "ninja",
        lang: "en",
        diskId: "nus0097",
        family: "ninja",
      });
      expect(planNarutoCanonicalDiskRename("ninja", "nus0097", "en")).toBeNull();
    });

    it("lifts leftover PR忍 scans out of the ninja folder onto promo/", () => {
      expect(planNarutoCanonicalDiskRename("ninja", "prni0006", "ja")).toEqual({
        fromRel: "ninja/prni0006/ja",
        toRel: "promo/prni0006/ja",
        appearanceSet: "promo",
        lang: "ja",
        diskId: "prni0006",
        family: "promo",
      });
    });

    it("lifts 幕 / 忍者学校 out of ninja/ onto their prefix folder", () => {
      expect(planNarutoCanonicalDiskRename("ninja", "gaku0001", "ja")).toEqual({
        fromRel: "ninja/gaku0001/ja",
        toRel: "gaku/gaku0001/ja",
        appearanceSet: "gaku",
        lang: "ja",
        diskId: "gaku0001",
        family: "gaku",
      });
      expect(planNarutoCanonicalDiskRename("ninja", "shi0001", "ja")).toEqual({
        fromRel: "ninja/shi0001/ja",
        toRel: "shi/shi0001/ja",
        appearanceSet: "shi",
        lang: "ja",
        diskId: "shi0001",
        family: "shi",
      });
      expect(planNarutoCanonicalDiskRename("jutsu", "mju0062", "ja")).toEqual({
        fromRel: "jutsu/mju0062/ja",
        toRel: "mju/mju0062/ja",
        appearanceSet: "mju",
        lang: "ja",
        diskId: "mju0062",
        family: "mju",
      });
    });

    it("does not re-plan a tree that is already family-first", () => {
      expect(planNarutoCardMove("ninja", "fr", "ni0001")).toBeNull();
    });
  });
}

// —— migrateVcBacks ——
{
  /**
   * carddass.fr saved `-vc` (version corrigée) faces as `back.jpg` inside the
   * card folder. The migration renames those to `art.corrected.*` — but it used
   * to walk from `cards/` and rename every `back.*` it met, including the pack
   * back this pipeline installs one step earlier. Every run turned the verso into
   * a stray `art.corrected.webp`, leaving the card with nothing to flip to.
   */
  function scaffold(): string {
    const root = mkdtempSync(path.join(tmpdir(), "naruto-vc-"));
    const cards = path.join(root, "cards");
    const card = path.join(cards, "s5", "fr", "ni232");
    mkdirSync(card, { recursive: true });
    mkdirSync(path.join(cards, "s5"), { recursive: true });
    writeFileSync(path.join(cards, "back.webp"), "pack-back");
    writeFileSync(path.join(cards, "s5", "back.webp"), "set-back");
    writeFileSync(path.join(card, "back.jpg"), "errata-face");
    return root;
  }

  describe("migrateNarutoVcBacksToCorrectedArt", () => {
    it("renames the mislabelled errata face inside a card folder", () => {
      const root = scaffold();
      expect(migrateNarutoVcBacksToCorrectedArt(root)).toBe(1);
      const card = path.join(root, "cards", "s5", "fr", "ni232");
      expect(existsSync(path.join(card, "art.corrected.jpg"))).toBe(true);
      expect(existsSync(path.join(card, "back.jpg"))).toBe(false);
    });

    it("leaves the pack back and the set verso alone", () => {
      const root = scaffold();
      migrateNarutoVcBacksToCorrectedArt(root);
      // Both are real versos, and the pack back is what the card flips to.
      expect(existsSync(path.join(root, "cards", "back.webp"))).toBe(true);
      expect(existsSync(path.join(root, "cards", "s5", "back.webp"))).toBe(true);
      expect(existsSync(path.join(root, "cards", "art.corrected.webp"))).toBe(
        false,
      );
    });
  });
}

// —— fixThumbs ——
{
  describe("thumbRatioDeviation", () => {
    it("is zero when the thumb keeps its face ratio", () => {
      expect(thumbRatioDeviation(350, 495, 350, 495)).toBe(0);
      expect(thumbRatioDeviation(175, 248, 350, 496)).toBeLessThan(0.005);
    });

    it("catches the squashed ta091 thumb", () => {
      // 400x458 thumb over a 350x495 face — the card flattened by a quarter.
      const d = thumbRatioDeviation(400, 458, 350, 495);
      expect(d).toBeGreaterThan(0.2);
      expect(d).toBeGreaterThan(THUMB_RATIO_TOLERANCE);
    });

    it("compares against the card's own face, not a corpus average", () => {
      // ni217: a 280x406 thumb is off a 350x495 norm but fine for its 843x1206
      // face, so a global median would flag it wrongly.
      expect(thumbRatioDeviation(280, 406, 843, 1206)).toBeLessThan(
        THUMB_RATIO_TOLERANCE,
      );
      expect(thumbRatioDeviation(280, 406, 350, 495)).toBeGreaterThan(
        THUMB_RATIO_TOLERANCE,
      );
    });

    it("returns 0 rather than NaN on degenerate sizes", () => {
      expect(thumbRatioDeviation(0, 0, 0, 0)).toBe(0);
      expect(thumbRatioDeviation(100, 0, 350, 495)).toBe(0);
    });
  });

  describe("correctedThumbSize", () => {
    it("keeps the height and rebuilds the width from the face ratio", () => {
      expect(correctedThumbSize(458, 350, 495)).toEqual({
        width: 324,
        height: 458,
      });
      expect(correctedThumbSize(391, 350, 495)).toEqual({
        width: 276,
        height: 391,
      });
    });

    it("produces a size that passes the check", () => {
      const { width, height } = correctedThumbSize(458, 350, 495);
      expect(thumbRatioDeviation(width, height, 350, 495)).toBeLessThan(
        THUMB_RATIO_TOLERANCE,
      );
    });
  });
}

