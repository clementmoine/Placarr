import { describe, expect, it } from "vitest";
import { enrichChecklistWithOfficialFaces, uprightKayouHorizontalScan } from "./faces";
import type { KayouChecklist } from "../identity";
import { listKayouLenticularPlayroomSamples } from "../playroomSamples";
import type { KayouOfficialCatalog } from "./crawl";

// —— kayouOfficialFaces ——
{
  describe("enrichChecklistWithOfficialFaces", () => {
    it("prefers official landscape fronts for wedding ◇MR rows", () => {
      const checklist: KayouChecklist = {
        source: "test",
        url: "https://example/",
        sets: [
          {
            slug: "ninjaageboxn",
            code: "ninjaageboxn",
            label: "N",
            url: "https://example/",
            cards: [
              {
                printed: "NR-CC-MR-001S",
                number: "cc.mr.001s",
                name: "Naruto Uzumaki",
                rarity: "CC-MR",
                faceUrl: "https://capsulecorpgear.com/wp-content/uploads/CC-MR-P001-H-yoccg.jpg",
                faceSource: "capsulecorpgear",
              },
            ],
          },
        ],
      };
      const catalog = {
        source: "test",
        ipId: "ip",
        observed: "",
        crawledAt: "",
        contentHash: "",
        previousHash: null,
        changed: false,
        series: [
          {
            seriesId: "series-x",
            seriesTypeName: "",
            seriesTypeDescription: "",
            productSpecs: {},
            sectionEyebrow: "",
            sectionTitle: "",
            url: "",
            cards: [
              {
                idCode: "NRCCNA-◇MR-001",
                name: "Happy Wedding",
                rarity: "◇MR",
                frontImage: "https://static-sg.kayouofficial.com/wedding-001.png",
                frontWidth: 1028,
                frontHeight: 733,
                backImage: "https://cdn.example/back.png",
              },
            ],
          },
        ],
      } satisfies KayouOfficialCatalog;

      const out = enrichChecklistWithOfficialFaces(checklist, catalog);
      const card = out.sets[0]!.cards[0]!;
      expect(card.faceUrl).toContain("kayouofficial.com");
      expect(card.faceSource).toBe("kayouofficial");
      expect(card.faceUrlAlternates).toContain(
        "https://capsulecorpgear.com/wp-content/uploads/CC-MR-P001-H-yoccg.jpg",
      );
    });
  });
}

// —— narutocardsFaces ——
{
  describe("uprightKayouHorizontalScan", () => {
    it("leaves CapsuleCorp -H- portrait buffers untouched (CSS landscapePrint)", async () => {
      const buf = Buffer.from("fake-jpeg");
      const out = await uprightKayouHorizontalScan(
        buf,
        "https://capsulecorpgear.com/wp-content/uploads/CC-MR-P001-H-yoccg.jpg",
      );
      expect(out).toBe(buf);
    });
  });
}

// —— playroomSamples ——
{
  describe("kayou playroom lenticular samples", () => {
    it("ships one face per lenticular family when the catalogue is installed", () => {
      const samples = listKayouLenticularPlayroomSamples();
      expect(samples.map((row) => row.variant)).toEqual([
        "hr-2x2",
        "hr-3x2",
        "hr-3x1",
        "hr-2x1",
        "bp",
        "mr",
        "holo",
      ]);
      for (const sample of samples) {
        expect(sample.imageUrl).toMatch(/^\/assets\/naruto\/kayou\//);
        expect(sample.foilMaskUrl).toContain("full_foil_mask.webp");
      }
      const byVariant = Object.fromEntries(samples.map((s) => [s.variant, s]));
      expect(byVariant["hr-2x2"]?.name).toBe("Sasuke & Naruto");
      expect(byVariant["hr-3x2"]?.printKey).toBe(
        "kayou:smritiheavenscrolls1-nrss.hr.005",
      );
      expect(byVariant["hr-3x1"]?.name).toBe("Ichiraku Ramen");
      expect(byVariant["hr-2x1"]?.name).toBe("Boruto Uzumaki");
    });
  });
}
