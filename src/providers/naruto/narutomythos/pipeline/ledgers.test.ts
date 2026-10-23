import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { buildMythosFromLedgers, MYTHOS_TITLE_LANG, pruneMythosComingSoonPlaceholders, pruneMythosUnattestedPrints, readAllMythosChecklists, readMythosChecklist } from "./ledgers";
import { formatMythosReference, mythosPrintKey, NARUTO_MYTHOS_KS1_SET_CODE, normalizeMythosSearchQuery } from "../printKey";
import { NARUTO_MYTHOS_PACK_ID } from "../pack";

// —— buildFromLedgers ——
{
  describe("checklist Mythos KS1", () => {
    const ledger = readMythosChecklist();

    it("porte Konoha Shidō Ch.1 sans doublon de clé", () => {
      expect(ledger.set.code).toBe(NARUTO_MYTHOS_KS1_SET_CODE);
      expect(ledger.cards.length).toBeGreaterThan(180);
      const keys = new Set(
        ledger.cards.map(
          (c) => `${c.number}:${c.grouping ?? ""}`,
        ),
      );
      expect(keys.size).toBe(ledger.cards.length);
    });

    it("sépare Rare Art et Mythos V du tirage de base", () => {
      const n104 = ledger.cards.filter((c) => c.number === "0104");
      expect(n104.some((c) => !c.grouping)).toBe(true);
      expect(n104.some((c) => c.grouping === "a")).toBe(true);
    });
  });

  describe("buildMythosFromLedgers", () => {
    it("aligne tirages officiels + complément LorenZone (lg/sg…)", () => {
      const report = buildMythosFromLedgers({ dryRun: true });
      expect(report.prints).toBe(report.rows);
      expect(report.titles).toBeGreaterThanOrEqual(report.rows);
      expect(report.skipped).toEqual([]);
      expect(report.sets).toEqual(
        expect.arrayContaining(["ks1", "ks1e2", "ks1promo", "ss2"]),
      );
      // CICABOOM gallery = 636 ; LorenZone ajoute Legendary / SG / chibi SS2…
      expect(report.prints).toBeGreaterThan(636);
      expect(report.titles).toBeGreaterThan(report.prints);
    });

    it("titre KS1 en français", () => {
      expect(MYTHOS_TITLE_LANG).toBe("fr");
    });

    it("reprend le Legendary KS1 absente de l’API CICABOOM", () => {
      const keys = new Set(
        readAllMythosChecklists().flatMap((l) =>
          l.cards.map(
            (c) => `${l.set.code}:${c.number}:${c.grouping ?? ""}`,
          ),
        ),
      );
      expect(keys.has("ks1:lg01:")).toBe(true);
      expect(keys.has("ks1:0104:v")).toBe(false); // Coming Soon LZ skipped
    });

    it("retire les Coming Soon ks1 quand le twin ks1promo existe", () => {
      const previous = process.env.PLACARR_DATA_DIR;
      const tmp = mkdtempSync(path.join(os.tmpdir(), "placarr-mythos-prune-"));
      process.env.PLACARR_DATA_DIR = tmp;
      try {
        const index = createLocalPrintsIndex(NARUTO_MYTHOS_PACK_ID);
        index.writePrints([
          {
            printKey: "mythos:ks1-0104-v",
            setCode: "ks1",
            number: "0104",
            cardType: "ks1",
            grouping: "v",
            titles: [{ lang: "fr", fullName: "Coming Soon" }],
          },
          {
            printKey: "mythos:ks1promo-0104-v",
            setCode: "ks1promo",
            number: "0104",
            cardType: "ks1promo",
            grouping: "v",
            titles: [{ lang: "fr", fullName: "Tsunade" }],
          },
          {
            printKey: "mythos:ks1-9999-v",
            setCode: "ks1",
            number: "9999",
            cardType: "ks1",
            grouping: "v",
            titles: [{ lang: "fr", fullName: "Coming Soon" }],
          },
        ]);
        expect(pruneMythosComingSoonPlaceholders(index)).toEqual([
          "mythos:ks1-0104-v",
        ]);
        expect(index.lookupRow("mythos:ks1-0104-v")).toBeNull();
        expect(index.lookupRow("mythos:ks1promo-0104-v")?.fullName).toBe(
          "Tsunade",
        );
        // No twin yet → keep the honest placeholder.
        expect(index.lookupRow("mythos:ks1-9999-v")?.fullName).toBe(
          "Coming Soon",
        );
      } finally {
        if (previous === undefined) delete process.env.PLACARR_DATA_DIR;
        else process.env.PLACARR_DATA_DIR = previous;
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("retire les fantômes ScanFlip CFA/CH hors checklist", () => {
      const previous = process.env.PLACARR_DATA_DIR;
      const tmp = mkdtempSync(path.join(os.tmpdir(), "placarr-mythos-ghost-"));
      process.env.PLACARR_DATA_DIR = tmp;
      try {
        const index = createLocalPrintsIndex(NARUTO_MYTHOS_PACK_ID);
        // Seed a real attested key + a ScanFlip ghost.
        const built = buildMythosFromLedgers({ index, dryRun: true });
        expect(built.prints).toBeGreaterThan(600);
        index.writePrints([
          {
            printKey: "mythos:ks1-0025",
            setCode: "ks1",
            number: "0025",
            cardType: "ks1",
            grouping: null,
            sourceUrl: "https://www.narutotcgmythos.com/fr/galerie",
            titles: [{ lang: "fr", fullName: "Kiba" }],
          },
          {
            printKey: "mythos:ks1-0025-a",
            setCode: "ks1",
            number: "0025",
            cardType: "ks1",
            grouping: "a",
            sourceUrl: "https://www.scanflip.fr/fr/naruto-mythos/cards",
            titles: [{ lang: "fr", fullName: "Kiba", rarity: "Common Full Art" }],
          },
          {
            printKey: "mythos:ks1-0025-chibi",
            setCode: "ks1",
            number: "0025",
            cardType: "ks1",
            grouping: "chibi",
            sourceUrl: "https://www.scanflip.fr/fr/naruto-mythos/cards",
            titles: [{ lang: "fr", fullName: "Kiba", rarity: "Common Holo" }],
          },
        ]);
        const removed = pruneMythosUnattestedPrints(index);
        expect(removed).toEqual(
          expect.arrayContaining([
            "mythos:ks1-0025-a",
            "mythos:ks1-0025-chibi",
          ]),
        );
        expect(removed).not.toContain("mythos:ks1-0025");
        expect(index.lookupRow("mythos:ks1-0025")?.fullName).toBe("Kiba");
        expect(index.lookupRow("mythos:ks1-0025-a")).toBeNull();
        expect(index.lookupRow("mythos:ks1-0025-chibi")).toBeNull();
      } finally {
        if (previous === undefined) delete process.env.PLACARR_DATA_DIR;
        else process.env.PLACARR_DATA_DIR = previous;
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe("clé et référence Mythos", () => {
    it("frappe le jeu mythos, pas naruto", () => {
      expect(mythosPrintKey("ks1", "0001")).toBe("mythos:ks1-0001");
      expect(mythosPrintKey("ks1", "0001", "a")).toBe("mythos:ks1-0001-a");
      expect(mythosPrintKey("ks1", "m1")).toBe("mythos:ks1-m1");
    });

    it("affiche la référence imprimée", () => {
      expect(formatMythosReference("ks1", "0001")).toBe("001/130");
      expect(formatMythosReference("ks1", "0001", "a")).toBe("001/130 A");
      expect(formatMythosReference("ks1", "m8")).toBe("M8");
      expect(formatMythosReference("ks1", "lg01")).toBe("XXXX/1000");
      expect(formatMythosReference("ss2", "0001")).toBe("001/140");
      expect(formatMythosReference("ss2", "mss01")).toBe("MSS01");
      expect(formatMythosReference("ss2", "lg01")).toBe("000/000");
    });

    it("normalise une recherche par référence imprimée", () => {
      expect(normalizeMythosSearchQuery("001/130")).toBe("0001");
      expect(normalizeMythosSearchQuery("1/140 A")).toBe("0001");
      expect(normalizeMythosSearchQuery("M8")).toBe("m8");
      expect(normalizeMythosSearchQuery("MSS01")).toBe("mss01");
    });
  });
}
