import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { colekaCarddassFrLedgerPath, loadColekaCarddassFrLedger, colekaS6ItLedgerPath, loadColekaS6ItLedger, mergeColekaS6ItIntoIndex, colekaSagesLegacyLedgerPath, colekaStorm3LedgerPath, loadColekaSagesLegacyLedger, loadColekaStorm3Ledger } from "./coleka";

// —— scrapeColekaCarddassFr ——
{
  describe("loadColekaCarddassFrLedger", () => {
    it("reads staging/coleka-carddass-fr under the pack root", () => {
      const packDir = mkdtempSync(path.join(tmpdir(), "naruto-coleka-fr-"));
      const dest = colekaCarddassFrLedgerPath(packDir);
      expect(dest).toBe(
        path.join(packDir, "staging", "coleka-carddass-fr", "cards.json"),
      );
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(
        dest,
        JSON.stringify({
          cards: [
            {
              number: "ni001",
              cardType: "ni",
              set: "s1",
              colekaRef: "NI-01",
              name: "Naruto Uzumaki",
              colekaId: "202417",
              pagePath: "/fr/x",
              thumbUrl: "https://thumbs.coleka.com/media/item/x_250x250.webp",
              faceUrl: "https://thumbs.coleka.com/media/item/x.webp",
            },
          ],
        }),
        "utf8",
      );
      expect(loadColekaCarddassFrLedger(packDir).map((c) => c.number)).toEqual([
        "ni001",
      ]);
    });
  });
}

// —— scrapeColekaS6It ——
{
  describe("loadColekaS6ItLedger", () => {
    it("reads staging/coleka-s6-it under the pack root", () => {
      const packDir = mkdtempSync(path.join(tmpdir(), "naruto-coleka-s6-it-"));
      const dest = colekaS6ItLedgerPath(packDir);
      expect(dest).toBe(
        path.join(packDir, "staging", "coleka-s6-it", "cards.json"),
      );
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(
        dest,
        JSON.stringify({
          cards: [
            {
              number: "ta226",
              cardType: "ta",
              colekaRef: "TA-226",
              printedRef: "ST-226",
              name: "Potere del segno maledetto",
              colekaId: "1761843",
              pagePath: "/fr/cartes-naruto-serie-06/potere_i1761843",
              thumbUrl: "https://thumbs.coleka.com/media/item/x_250x250.webp",
              faceUrl: "https://thumbs.coleka.com/media/item/x.webp",
            },
            {
              number: "cl032",
              cardType: "cl",
              colekaRef: "CL-32",
              printedRef: "CL-32",
              name: null,
              colekaId: "1761802",
              pagePath: "/fr/cartes-naruto-serie-06/carte-cl-32_i1761802",
              thumbUrl: null,
              faceUrl: null,
            },
          ],
        }),
        "utf8",
      );
      expect(loadColekaS6ItLedger(packDir).map((c) => c.number)).toEqual([
        "ta226",
        "cl032",
      ]);
    });
  });

  describe("mergeColekaS6ItIntoIndex", () => {
    it("adds s6 prints and Italian titles without inventing a French name", () => {
      const packDir = mkdtempSync(path.join(tmpdir(), "naruto-s6-it-merge-"));
      const dest = colekaS6ItLedgerPath(packDir);
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(
        dest,
        JSON.stringify({
          cards: [
            {
              number: "ta226",
              cardType: "ta",
              colekaRef: "TA-226",
              printedRef: "ST-226",
              name: "Potere del segno maledetto",
              colekaId: "1",
              pagePath: "/x",
              thumbUrl: null,
              faceUrl: null,
            },
            {
              number: "cl032",
              cardType: "cl",
              colekaRef: "CL-32",
              printedRef: "CL-32",
              name: null,
              colekaId: "2",
              pagePath: "/y",
              thumbUrl: null,
              faceUrl: null,
            },
          ],
        }),
        "utf8",
      );
      const merged = mergeColekaS6ItIntoIndex({
        prints: [],
        titles: [],
        root: packDir,
      });
      expect(merged.addedPrints).toEqual(["naruto:cl-0032", "naruto:ta-0226"]);
      expect(merged.titles).toEqual([
        {
          printKey: "naruto:ta-0226",
          lang: "it",
          fullName: "Potere del segno maledetto",
          rarity: null,
        },
      ]);
      expect(merged.prints.map((p) => p.number)).toEqual(["cl0032", "ta0226"]);
    });
  });
}

// —— scrapeColekaStorm3 ——
{
  describe("loadColekaStorm3Ledger", () => {
    it("reads staging/coleka-s28 under the pack root (not nested twice)", () => {
      const packDir = mkdtempSync(path.join(tmpdir(), "naruto-coleka-s28-"));
      const dest = colekaStorm3LedgerPath(packDir);
      expect(dest).toBe(
        path.join(packDir, "staging", "coleka-s28", "cards.json"),
      );
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(
        dest,
        JSON.stringify({
          cards: [
            {
              number: "n1650",
              cardType: "n",
              colekaRef: "NI-1650",
              name: "Kisame Hoshigaki",
              colekaId: "819630",
              pagePath: "/fr/cartes-naruto-serie-28/kisame-hoshigaki_i819630",
              thumbUrl:
                "https://thumbs.coleka.com/media/item/202102/10/cartes-naruto-serie-28-kisame-hoshigaki-ni-1650_250x250.webp",
              faceUrl:
                "https://thumbs.coleka.com/media/item/202102/10/cartes-naruto-serie-28-kisame-hoshigaki-ni-1650.webp",
            },
          ],
        }),
        "utf8",
      );
      expect(loadColekaStorm3Ledger(packDir).map((c) => c.number)).toEqual([
        "n1650",
      ]);
    });
  });

  describe("loadColekaSagesLegacyLedger", () => {
    it("reads staging/coleka-s24 under the pack root (not nested twice)", () => {
      const packDir = mkdtempSync(path.join(tmpdir(), "naruto-coleka-s24-"));
      const dest = colekaSagesLegacyLedgerPath(packDir);
      expect(dest).toBe(
        path.join(packDir, "staging", "coleka-s24", "cards.json"),
      );
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(
        dest,
        JSON.stringify({
          cards: [
            {
              number: "j895",
              cardType: "j",
              colekaRef: "JU-895",
              name: "Scellage des Démons à Queues",
              colekaId: "788802",
              pagePath:
                "/fr/cartes-naruto-serie-24-sage-s-legacy/scellage-des-demons-a-queues_i788802",
              thumbUrl:
                "https://thumbs.coleka.com/media/item/202010/16/cartes-naruto-serie-24-sage-s-legacy-scellage-des-demons-a-queues_250x250.webp",
              faceUrl:
                "https://thumbs.coleka.com/media/item/202010/16/cartes-naruto-serie-24-sage-s-legacy-scellage-des-demons-a-queues.webp",
            },
          ],
        }),
        "utf8",
      );
      expect(loadColekaSagesLegacyLedger(packDir).map((c) => c.number)).toEqual([
        "j895",
      ]);
    });
  });
}

