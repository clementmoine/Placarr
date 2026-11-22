import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { enrichChecklistWithOfficialFaces, harvestKayouFaces, installKayouFaces, kayouFacesContentHash, uprightKayouHorizontalScan } from "./faces";
import { packCardDir } from "@/lib/packPaths";
import type { KayouChecklist } from "../identity";
import { listKayouLenticularPlayroomSamples } from "../playroomSamples";
import type { KayouOfficialCatalog } from "./crawl";
import {
  packCatalogIngestLedgerPath,
  writeCatalogIngestLedger,
  emptyCatalogIngestLedger,
} from "@/providers/shared/catalogIngestLedger";
import { NARUTO_KAYOU_PACK_ID } from "../pack";

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

  describe("kayouFacesContentHash / harvest skip", () => {
    const roots: string[] = [];
    afterEach(() => {
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
      vi.unstubAllEnvs();
    });

    const miniChecklist: KayouChecklist = {
      source: "test",
      url: "https://example/",
      sets: [
        {
          slug: "s1",
          code: "s1",
          label: "S1",
          url: "https://example/",
          cards: [
            {
              printed: "001",
              number: "001",
              name: "Naruto",
              rarity: "C",
              faceUrl: "https://example/1.webp",
            },
          ],
        },
      ],
    };

    it("is stable for equal checklists", () => {
      const a = kayouFacesContentHash(miniChecklist);
      const b = kayouFacesContentHash(miniChecklist);
      expect(a).toBe(b);
      expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    it("harvestKayouFaces skips when ingest ledger is fresh", async () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "kayou-fresh-"));
      roots.push(root);
      vi.stubEnv("PLACARR_DATA_DIR", root);
      const contentHash = kayouFacesContentHash(miniChecklist);
      const ledgerPath = packCatalogIngestLedgerPath(NARUTO_KAYOU_PACK_ID);
      mkdirSync(path.dirname(ledgerPath), { recursive: true });
      const ledger = emptyCatalogIngestLedger();
      ledger.entries["kayou:kayou-faces"] = {
        artefactId: "kayou:kayou-faces",
        contentHash,
        promotedAt: "2026-01-01T00:00:00.000Z",
      };
      writeCatalogIngestLedger(ledgerPath, ledger);

      const out = await harvestKayouFaces({ checklist: miniChecklist });
      expect(out.skippedFresh).toBe(true);
      expect(out.skip).toBe(1);
      expect(out.ok).toBe(0);
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

// —— installKayouFaces ——
{
  describe("installKayouFaces", () => {
    let prevDataDir: string | undefined;
    afterEach(() => {
      if (prevDataDir === undefined) delete process.env.PLACARR_DATA_DIR;
      else process.env.PLACARR_DATA_DIR = prevDataDir;
    });

    it("installs faces in the lang-first card dir the app and probes read", () => {
      // 2026-11-22 : les faces partaient dans `cards/<set>/<lang>/` (ordre
      // d'avant b50d4220) ; le marquage lenticulaire et l'app lisent
      // `cards/<lang>/<set>/` (`packCardDir`) — t4w3 HR 084 perdait sa grille.
      prevDataDir = process.env.PLACARR_DATA_DIR;
      const root = mkdtempSync(path.join(os.tmpdir(), "kayou-faces-install-"));
      process.env.PLACARR_DATA_DIR = path.join(root, "data");
      const staging = path.join(root, "staging");
      mkdirSync(staging, { recursive: true });
      writeFileSync(path.join(staging, "t4w3-nr.hr.084.webp"), "webp");
      const written: { printKey: string; art: string }[] = [];
      const index = {
        writeAssets: (rows: { printKey: string; art: string }[]) =>
          written.push(...rows),
      } as unknown as Parameters<typeof installKayouFaces>[0];

      const out = installKayouFaces(index, {
        stagingDir: staging,
        lang: "en",
        force: true,
        checklist: {
          source: "test",
          url: "https://example/",
          sets: [
            {
              slug: "t4w3",
              code: "t4w3",
              label: "T4W3",
              url: "https://example/",
              cards: [
                {
                  printed: "NR-HR-084",
                  number: "nr.hr.084",
                  name: "Hinata & Naruto",
                  rarity: "HR",
                  faceUrl: "https://narutopia.fr/wp-content/uploads/2023/08/HR-84.webp",
                },
              ],
            },
          ],
        },
      });

      expect(out.faces).toBe(1);
      const art = written[0]!.art;
      expect(
        existsSync(
          packCardDir(NARUTO_KAYOU_PACK_ID, {
            set: "t4w3",
            lang: "en",
            card: "nr.hr.084",
          }) + `/${art}`,
        ),
      ).toBe(true);
      rmSync(root, { recursive: true, force: true });
    });
  });
}
