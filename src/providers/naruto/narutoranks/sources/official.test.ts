import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { packCardsDir, packCatalogDb, packProductsIndexPath, packSealedProductsDir } from "@/lib/packPaths";
import sharp from "sharp";
import { buildFrenchNinjaRanksTitles } from "./titles";
import { buildNinjaRanksFromLedgers } from "../pipeline/ledgers";
import {
  cutImadokiSheet,
  ingestInkworksProducts,
  inkworksHarvestList,
  inkworksSkippedFiles,
  inkworksWaybackRawUrl,
  installInkworksSampleFaces,
  readInkworksProductsLedger,
  readNinjaRanksReconstructedArt,
} from "./faces";
import { NARUTO_RANKS_PACK_ID } from "../pack";
import type { ImadokiSheet } from "../parse/catalogues";

// —— inkworksOfficial ——
{
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  function tmpDataRoot(): string {
    const root = mkdtempSync(path.join(os.tmpdir(), "inkworks-official-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    return root;
  }

  const TINY = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

  function stageOfficialJpegs(): string {
    const staging = mkdtempSync(path.join(os.tmpdir(), "inkworks-stage-"));
    roots.push(staging);
    const ledger = readInkworksProductsLedger();
    for (const sku of ledger.skus) {
      writeFileSync(path.join(staging, sku.art), TINY);
    }
    writeFileSync(path.join(staging, ledger.logo.file), TINY);
    for (const sample of ledger.sampleCards) {
      writeFileSync(path.join(staging, sample.file), TINY);
    }
    return staging;
  }

  describe("Inkworks official assets", () => {
    it("dumps every official JPEG into staging; ingest still skips the marketing", () => {
      const ledger = readInkworksProductsLedger();
      expect(ledger.skus.map((row) => row.slug)).toEqual([
        "booster",
        "display",
        "collector-album",
      ]);
      expect(inkworksHarvestList(ledger).map((row) => row.file)).toEqual(
        Object.keys(ledger.captures).sort(),
      );
      expect(inkworksSkippedFiles(ledger)).toEqual([
        "nnrsetssm.jpg",
        "nnrcard1sm.jpg",
        "nnrcard1med.jpg",
        "nnrpism.jpg",
        "nnrpimed2.jpg",
        "paninilogosm.jpg",
      ]);
      expect(inkworksHarvestList(ledger).map((row) => row.file)).toEqual(
        expect.arrayContaining(inkworksSkippedFiles(ledger)),
      );
      expect(inkworksWaybackRawUrl(ledger.captures["nnrwrapmed.jpg"]!)).toBe(
        "https://web.archive.org/web/20060624044103id_/http://inkworks.com/images/productsimg/naruto/ninjaranks/nnrwrapmed.jpg",
      );
    });

    it("writes booster, display and album as sealed products, not as cards", () => {
      tmpDataRoot();
      const staging = stageOfficialJpegs();
      const report = ingestInkworksProducts({
        stagingDir: staging,
        // Dossier curé vide : on exerce ici la branche Inkworks seule.
        curatedProductsDir: path.join(staging, "no-curated"),
      });
      expect(report.written).toBe(3);
      expect(report.skipped).toBe(0);

      const index = JSON.parse(
        readFileSync(packProductsIndexPath(NARUTO_RANKS_PACK_ID), "utf8"),
      ) as {
        products: Record<
          string,
          { slug: string; kind: string; image: string; name: string }
        >;
      };
      expect(Object.keys(index.products).sort()).toEqual([
        "naruto/ninja-ranks::booster",
        "naruto/ninja-ranks::collector-album",
        "naruto/ninja-ranks::display",
      ]);
      expect(index.products["naruto/ninja-ranks::booster"]).toMatchObject({
        kind: "booster",
        name: "Naruto: Ninja Ranks booster pack",
        image: "/assets/naruto/ninja-ranks/products/booster/en/art.inkworks.jpg",
      });
      expect(index.products["naruto/ninja-ranks::display"].kind).toBe("display");
      expect(index.products["naruto/ninja-ranks::collector-album"].kind).toBe(
        "coffret",
      );
      expect(
        existsSync(path.join(packCardsDir(NARUTO_RANKS_PACK_ID), "booster")),
      ).toBe(false);
    });

    it("installs only the two attested sample faces", () => {
      tmpDataRoot();
      const staging = stageOfficialJpegs();
      const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
      buildNinjaRanksFromLedgers({ index });
      const faces = installInkworksSampleFaces(index, { stagingDir: staging });
      expect(faces).toEqual({ installed: 2, skipped: [] });
      expect(index.lookupRow("naruto:sd-0001")?.art).toBe("art.inkworks.jpg");
      expect(index.lookupRow("naruto:bl-0001")?.art).toBe("art.inkworks.jpg");
      expect(index.lookupRow("naruto:nr-0001")?.art).toBeNull();
      expect(
        existsSync(
          path.join(
            packCardsDir(NARUTO_RANKS_PACK_ID),
            "sd",
            "en",
            "0001",
            "art.inkworks.jpg",
          ),
        ),
      ).toBe(true);
    });

    it("attests sell-sheet UPCs without minting a case SKU", () => {
      const { sellSheet, skus } = readInkworksProductsLedger();
      expect(skus.map((row) => row.slug)).not.toContain("case");
      expect(upcAChecksumOk(sellSheet.upc.pack)).toBe(true);
      expect(upcAChecksumOk(sellSheet.upc.display)).toBe(true);
      expect(upcAChecksumOk(sellSheet.upc.case)).toBe(true);
      expect(upcAChecksumOk(sellSheet.upc.album)).toBe(true);
      expect(upcAChecksumOk(sellSheet.upc.albumCase)).toBe(true);
      expect(sellSheet.upc.pack).toBe("080557205523");
      expect(sellSheet.upc.album).toBe("080557205516");
    });
  });

  function upcAChecksumOk(digits: string): boolean {
    if (!/^\d{12}$/.test(digits)) return false;
    const body = digits.slice(0, 11);
    let odd = 0;
    let even = 0;
    for (let i = 0; i < body.length; i += 1) {
      const n = Number(body[i]);
      if (i % 2 === 0) odd += n;
      else even += n;
    }
    const check = (10 - ((odd * 3 + even) % 10)) % 10;
    return check === Number(digits[11]);
  }

  describe("packshots curés", () => {
    it("affiche le packshot curé et rétrograde l'officiel en dump", () => {
      tmpDataRoot();
      const staging = stageOfficialJpegs();
      const curated = mkdtempSync(path.join(os.tmpdir(), "nr-curated-"));
      roots.push(curated);
      for (const sku of readInkworksProductsLedger().skus) {
        const dir = path.join(curated, sku.slug, "en");
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, "art.reconstructed.png"), TINY);
      }

      ingestInkworksProducts({
        stagingDir: staging,
        curatedProductsDir: curated,
      });

      const dir = path.join(
        packSealedProductsDir(NARUTO_RANKS_PACK_ID),
        "booster",
        "en",
      );
      // Le curé s'affiche, l'officiel reste à côté : jamais écrasé.
      expect(existsSync(path.join(dir, "art.reconstructed.png"))).toBe(true);
      expect(existsSync(path.join(dir, "art.inkworks.jpg"))).toBe(true);
    });

    it("ne bascule pas le lot si un seul SKU a son packshot curé", () => {
      // Sinon un visuel Inkworks porterait le nom `art.reconstructed` — un
      // mensonge sur sa provenance, puisque le lot ne déclare qu'une source.
      tmpDataRoot();
      const staging = stageOfficialJpegs();
      const curated = mkdtempSync(path.join(os.tmpdir(), "nr-partial-"));
      roots.push(curated);
      const only = path.join(curated, "booster", "en");
      mkdirSync(only, { recursive: true });
      writeFileSync(path.join(only, "art.reconstructed.png"), TINY);
      expect(readNinjaRanksReconstructedArt(curated).size).toBe(1);

      ingestInkworksProducts({
        stagingDir: staging,
        curatedProductsDir: curated,
      });

      const dir = path.join(
        packSealedProductsDir(NARUTO_RANKS_PACK_ID),
        "booster",
        "en",
      );
      expect(existsSync(path.join(dir, "art.inkworks.jpg"))).toBe(true);
      expect(existsSync(path.join(dir, "art.reconstructed.png"))).toBe(false);
    });
  });
}

// —— frenchTitles ——
{
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  function tmpDataRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ninja-ranks-fr-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    return root;
  }

  function localeTitle(printKey: string, lang: string): string | null {
    const db = new DatabaseSync(packCatalogDb(NARUTO_RANKS_PACK_ID), {
      readOnly: true,
    });
    try {
      const row = db
        .prepare(
          `SELECT full_name FROM print_titles WHERE print_key = ? AND lang = ?`,
        )
        .get(printKey, lang) as { full_name: string } | undefined;
      return row?.full_name ?? null;
    } finally {
      db.close();
    }
  }

  const frenchTitle = (printKey: string) => localeTitle(printKey, "fr");

  describe("buildFrenchNinjaRanksTitles", () => {
    it("writes attested locale titles then fills shared names from English", () => {
      tmpDataRoot();
      buildNinjaRanksFromLedgers();
      const report = buildFrenchNinjaRanksTitles();
      // 72 FR checklist + 2 FR hors base (ff-2, sd-5) + IT attestés (nr + ff).
      expect(report.ledgerRows).toBe(72);
      expect(report.languageSpecificRows).toBeGreaterThanOrEqual(2);
      expect(report.titles).toBe(report.ledgerRows + report.languageSpecificRows);
      expect(report.sharedFromEnglish).toBeGreaterThan(0);
      expect(report.skipped).toEqual([]);
      expect(report.missing).toEqual([]);

      expect(frenchTitle("naruto:nr-0001")).toBe("Et voici les ninjas !");
      expect(frenchTitle("naruto:nr-0044")).toBe("Gaï");
      expect(frenchTitle("naruto:nr-0058")).toBe("Hokage le 3e");
      expect(frenchTitle("naruto:nr-0066")).toBe("Groupe de Konohamaru");
      expect(frenchTitle("naruto:nr-0068")).toBe("Second Examen des Survivants");
      expect(frenchTitle("naruto:nr-0070")).toBe("Kakashi-Zabuza");
      expect(frenchTitle("naruto:nr-0071")).toBe("Carte");
      expect(frenchTitle("naruto:nr-0057")).toBe("Dosu");
      expect(frenchTitle("naruto:ff-0001")).toBe("Guy - Kakashi");
      expect(frenchTitle("naruto:ff-0002")).toBe("DEMON-RENARD");
      expect(frenchTitle("naruto:sd-0005")).toBe("HOKAGE LE 4E");
      expect(frenchTitle("naruto:nw-0001")).toBe("Naruto");
      expect(frenchTitle("naruto:nw-0009")).toBe("Rock lee");

      expect(localeTitle("naruto:nr-0002", "it")).toBe("GRUPPO 7");
      expect(localeTitle("naruto:ff-0002", "it")).toBe("VOLPE A 9 CODE");
      expect(localeTitle("naruto:nw-0001", "it")).toBe("Naruto");

      const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
      expect(index.lookupRow("naruto:nr-0001")?.fullName).toBe("Title Card");
      expect(
        index.lookupRow("naruto:ff-0002", { language: "fr" })?.fullName,
      ).toBe("DEMON-RENARD");
    });
  });
}

// —— imadokiSheets ——
{
  async function sheetWithCenteredCard(opts: {
    sheetW: number;
    sheetH: number;
    cardW: number;
    cardH: number;
    margin: number;
    /** Scan bed grey — default pure white. */
    background?: string;
  }): Promise<Buffer> {
    const { sheetW, sheetH, cardW, cardH, margin } = opts;
    const background = opts.background ?? "#ffffff";
    const left = margin;
    const top = margin;
    return sharp({
      create: {
        width: sheetW,
        height: sheetH,
        channels: 3,
        background,
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: cardW,
              height: cardH,
              channels: 3,
              background: "#f97316",
            },
          })
            .png()
            .toBuffer(),
          left,
          top,
        },
      ])
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  describe("cutImadokiSheet", () => {
    it("recadre les marges blanches internes après découpe de grille", async () => {
      const sheet: ImadokiSheet = {
        file: "synthetic.jpg",
        columns: 1,
        rows: 1,
        gridMode: "equal",
        slots: [{ setCode: "nr", number: "0001" }],
      };
      const bytes = await sheetWithCenteredCard({
        sheetW: 300,
        sheetH: 400,
        cardW: 180,
        cardH: 260,
        margin: 40,
      });

      const { cuts } = await cutImadokiSheet(bytes, sheet);

      expect(cuts).toHaveLength(1);
      const meta = await sharp(cuts[0]!.buffer).metadata();
      expect(meta.width).toBeLessThan(300);
      expect(meta.height).toBeLessThan(400);
      expect(meta.width).toBeGreaterThanOrEqual(170);
      expect(meta.height).toBeGreaterThanOrEqual(250);
    });

    it("recadre un fond gris clair type scan Imadoki", async () => {
      const sheet: ImadokiSheet = {
        file: "synthetic-grey.jpg",
        columns: 1,
        rows: 1,
        gridMode: "equal",
        slots: [{ setCode: "nr", number: "0002" }],
      };
      const bytes = await sheetWithCenteredCard({
        sheetW: 300,
        sheetH: 400,
        cardW: 180,
        cardH: 260,
        margin: 40,
        background: "#ededed",
      });

      const { cuts } = await cutImadokiSheet(bytes, sheet);

      expect(cuts).toHaveLength(1);
      const meta = await sharp(cuts[0]!.buffer).metadata();
      expect(meta.width).toBeLessThan(220);
      expect(meta.height).toBeLessThan(320);
    });
  });
}
