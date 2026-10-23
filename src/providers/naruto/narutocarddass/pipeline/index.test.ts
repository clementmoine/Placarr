import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { decodeNarutoHtmlEntities, foldNarutoCardsIndex, foldNarutoCatalogueRecords, isImplausibleNarutoTitle, pickBetterNarutoTitle, planNarutoCardMove, planNarutoCanonicalDiskRename, planNarutoLayoutMovesFromTree, relocateMiskeyedPromoAppearances, THUMB_RATIO_TOLERANCE, correctedThumbSize, thumbRatioDeviation, upsertNarutoAppearances } from ".";
import { loadNarutoAppearancesFile, narutoDiskCardId, writeNarutoAppearancesFile } from "../identity";
import { migrateNarutoVcBacksToCorrectedArt } from "../scrape/scrapeCards";

// —— foldNarutoIndex ——
{
  describe("isImplausibleNarutoTitle", () => {
    it("rejects scrape leftovers and keeps real names", () => {
      expect(isImplausibleNarutoTitle("qui")).toBe(true);
      expect(isImplausibleNarutoTitle("Carte NI-064")).toBe(true);
      expect(isImplausibleNarutoTitle("peut l'utiliser")).toBe(true);
      expect(isImplausibleNarutoTitle("Kakashi Hatake")).toBe(false);
      expect(isImplausibleNarutoTitle("Ino")).toBe(false);
      expect(isImplausibleNarutoTitle("L'esprit du sable")).toBe(false);
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

    it("keeps 巻ノ and EU set-scoped memberships distinct", () => {
      const folded = foldNarutoCardsIndex({
        version: 1,
        pack: "naruto/carddass",
        generatedAt: "2026-01-01T00:00:00.000Z",
        cards: {
          "naruto:maki1-ni0009": {
            set: "ninja",
            card: "ni0009",
            langs: { ja: { name: "ミズキ" }, fr: { art: "art.jpg" } },
          },
          "naruto:s1-ni0009": {
            set: "ninja",
            card: "ni0009",
            langs: { fr: { name: "Mizuki", art: "art.jpg" } },
          },
        },
      });
      expect(Object.keys(folded.cards).sort()).toEqual([
        "naruto:maki1-ni0009",
        "naruto:s1-ni0009",
      ]);
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

    it("keeps manga prerelease and promo titles off the retail collector", () => {
      const folded = foldNarutoCatalogueRecords({
        prints: [
          {
            printKey: "naruto:s1-ni0019",
            setCode: "s1",
            number: "ni0019",
            cardType: "ni",
          },
          {
            printKey: "naruto:s1-ni0019-prerelease",
            setCode: "s1",
            number: "ni0019-prerelease",
            cardType: "ni",
            grouping: "prerelease",
          },
          {
            printKey: "naruto:s1-ni0023",
            setCode: "s1",
            number: "ni0023",
            cardType: "ni",
          },
          {
            printKey: "naruto:promo-ni0023",
            setCode: "promo",
            number: "ni0023-promo",
            cardType: "ni",
            grouping: "promo",
          },
        ],
        titles: [
          {
            printKey: "naruto:s1-ni0019",
            lang: "fr",
            fullName: "Naruto Uzumaki",
          },
          {
            printKey: "naruto:s1-ni0019-prerelease",
            lang: "fr",
            fullName: "Naruto Uzumaki",
            rarity: "prerelease",
          },
          {
            printKey: "naruto:promo-ni0023",
            lang: "fr",
            fullName: "Kakashi Hatake",
            rarity: "promo",
          },
        ],
      });
      const keys = folded.prints.map((p) => p.printKey).sort();
      expect(keys).toEqual([
        "naruto:promo-ni0023",
        "naruto:s1-ni0019",
        "naruto:s1-ni0019-prerelease",
        "naruto:s1-ni0023",
      ]);
      expect(
        folded.titles.find((t) => t.printKey === "naruto:s1-ni0019-prerelease"),
      ).toMatchObject({ fullName: "Naruto Uzumaki", rarity: "prerelease" });
      expect(
        folded.titles.find((t) => t.printKey === "naruto:promo-ni0023"),
      ).toMatchObject({ fullName: "Kakashi Hatake", rarity: "promo" });
    });

    it("does not fold cards-index promo/prerelease onto retail via bare card hint", () => {
      const folded = foldNarutoCardsIndex({
        version: 1,
        pack: "naruto/carddass",
        generatedAt: "2026-01-01T00:00:00.000Z",
        cards: {
          "naruto:s1-ni0024": {
            set: "ninja",
            card: "ni024",
            name: "Zabuza Momochi",
            langs: { fr: { art: "art.jpg" } },
          },
          "naruto:promo-ni0024": {
            set: "promo",
            card: "ni024",
            name: "Zabuza Momochi",
            rarity: "promo",
            langs: {},
          },
          "naruto:ni-0019": {
            set: "ninja",
            card: "ni0019",
            langs: { fr: { art: "art.jpg" } },
          },
          "naruto:ni-0019-prerelease": {
            set: "prerelease",
            card: "ni0019",
            rarity: "prerelease",
            langs: { fr: { name: "Naruto Uzumaki" } },
          },
        },
      });
      expect(Object.keys(folded.cards).sort()).toEqual([
        "naruto:ni-0019",
        "naruto:promo-ni0024",
        "naruto:s1-ni0019-prerelease",
        "naruto:s1-ni0024",
      ]);
    });
  });
}

// —— migrateCardLayout ——
{
  describe("planNarutoCardMove", () => {
    it("lifts series folders onto lang / set / printed id", () => {
      expect(planNarutoCardMove("s1", "fr", "ni001")).toEqual({
        fromRel: "s1/fr/ni001",
        toRel: "fr/s1/ni0001",
        appearanceSet: "s1",
        lang: "fr",
        diskId: "ni0001",
        family: "ninja",
      });
      expect(planNarutoCardMove("s1", "en", "n001")?.toRel).toBe("en/s1/n0001");
      expect(planNarutoCardMove("s28", "fr", "n1650")?.toRel).toBe(
        "fr/s28/n1650",
      );
      expect(planNarutoCardMove("s6", "it", "ta226")?.toRel).toBe(
        "it/s6/ta0226",
      );
      expect(planNarutoCardMove("s6", "jap", "ni255")?.lang).toBe("ja");
      expect(planNarutoCardMove("promo", "fr", "ni023")?.toRel).toBe(
        "fr/promo/ni0023-promo",
      );
      expect(planNarutoCardMove("promo", "fr", "pr011")?.toRel).toBe(
        "fr/promo/pr0011",
      );
      expect(planNarutoCardMove("promo", "ja", "prni0001")?.toRel).toBe(
        "ja/promo/prni0001",
      );
      expect(narutoDiskCardId("PR-忍-1", "promo")).toBe("prni0001");
      expect(planNarutoCardMove("s6", "en", "n0097-us")?.toRel).toBe(
        "en/s6/nus0097",
      );
    });

    it("renames a leftover n0097-us folder onto lang/s1/…", () => {
      expect(planNarutoCanonicalDiskRename("ninja", "n0097-us", "en")).toEqual({
        fromRel: "ninja/n0097-us/en",
        toRel: "en/s1/nus0097",
        appearanceSet: "s1",
        lang: "en",
        diskId: "nus0097",
        family: "ninja",
      });
      expect(planNarutoCanonicalDiskRename("ninja", "nus0097", "en")).toBeNull();
    });

    it("lifts leftover PR忍 scans onto lang/promo/…", () => {
      expect(planNarutoCanonicalDiskRename("ninja", "prni0006", "ja")).toEqual({
        fromRel: "ninja/prni0006/ja",
        toRel: "ja/promo/prni0006",
        appearanceSet: "promo",
        lang: "ja",
        diskId: "prni0006",
        family: "promo",
      });
    });

    it("lifts 幕 / 忍者学校 onto lang/{prefix}/…", () => {
      expect(planNarutoCanonicalDiskRename("ninja", "gaku0001", "ja")).toEqual({
        fromRel: "ninja/gaku0001/ja",
        toRel: "ja/gaku/gaku0001",
        appearanceSet: "gaku",
        lang: "ja",
        diskId: "gaku0001",
        family: "gaku",
      });
      expect(planNarutoCanonicalDiskRename("ninja", "shi0001", "ja")).toEqual({
        fromRel: "ninja/shi0001/ja",
        toRel: "ja/shi/shi0001",
        appearanceSet: "shi",
        lang: "ja",
        diskId: "shi0001",
        family: "shi",
      });
      expect(planNarutoCanonicalDiskRename("jutsu", "mju0062", "ja")).toEqual({
        fromRel: "jutsu/mju0062/ja",
        toRel: "ja/mju/mju0062",
        appearanceSet: "mju",
        lang: "ja",
        diskId: "mju0062",
        family: "mju",
      });
    });

    it("does not re-plan a tree that is already family-first", () => {
      expect(planNarutoCardMove("ninja", "fr", "ni0001")).toBeNull();
    });

    it("never treats a lang-first root as a set (would invert en/s1 → s1/en)", () => {
      expect(planNarutoCardMove("en", "s1", "n0001")).toBeNull();
      expect(planNarutoCardMove("s1", "n0001", "en")).toBeNull();
    });
  });

  describe("planNarutoLayoutMovesFromTree", () => {
    it("skips already lang-first trees", () => {
      const root = mkdtempSync(path.join(tmpdir(), "naruto-layout-lang-"));
      const card = path.join(root, "en", "s1", "n0001");
      mkdirSync(card, { recursive: true });
      writeFileSync(path.join(card, "art.drive.webp"), "x");
      expect(planNarutoLayoutMovesFromTree(root)).toEqual([]);
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

// —— promo appearances ——
{
  describe("upsertNarutoAppearances / relocateMiskeyedPromoAppearances", () => {
    it("stamps promo appearances onto te0107-promo, not bare te0107", () => {
      const root = mkdtempSync(path.join(tmpdir(), "naruto-promo-app-"));
      upsertNarutoAppearances(root, [
        { diskId: "te0107", lang: "ja", appearanceSet: "promo" },
        { diskId: "te0107", lang: "fr", appearanceSet: "s3" },
      ]);
      const afterUpsert = loadNarutoAppearancesFile(root);
      expect(afterUpsert?.appearances["te0107-promo"]).toEqual({ ja: "promo" });
      expect(afterUpsert?.appearances["te0107"]).toEqual({ fr: "s3" });

      writeNarutoAppearancesFile(root, {
        generatedAt: "2026-01-01T00:00:00.000Z",
        appearances: {
          te0108: { fr: "s3", ja: "promo" },
        },
      });
      expect(relocateMiskeyedPromoAppearances(root)).toBe(1);
      const relocated = loadNarutoAppearancesFile(root);
      expect(relocated?.appearances["te0108"]).toEqual({ fr: "s3" });
      expect(relocated?.appearances["te0108-promo"]).toEqual({ ja: "promo" });
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

