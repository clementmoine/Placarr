import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { dataCarddassChitoroshopIngestFaces, dataCarddassEbayIngestFaces, dataCarddassEbayListingImageFull, dataCarddassMercariIngestFaces, dataCarddassTvTokyoIngestFaces } from "../sources/faces";
import { extractPrintedFromChitoroshopProduct, facesFromChitoroshopProducts, normalizeChitoroshopImageUrl } from "../harvest";
import { installDataCarddassFrilFaces, installDataCarddassReconstructedFaces, listCuratedDataCarddassFaces, readDataCarddassReconstructedFacesLedger } from "./faces";
import { NARUTO_DATA_CARDDASS_PACK_ID } from "../pack";
import { parseDataCarddassPrinted } from "../printKey";

// —— installFrilFaces ——
{
  describe("installDataCarddassFrilFaces", () => {
    it("installe art.fril même si art.ebay est déjà là", async () => {
      const packRoot = mkdtempSync(path.join(tmpdir(), "fril-pack-"));
      const curatedRoot = mkdtempSync(path.join(tmpdir(), "fril-curated-"));
      for (const number of ["005", "007"]) {
        const curatedDir = path.join(curatedRoot, "cards", "nf", "ja", number);
        mkdirSync(curatedDir, { recursive: true });
        writeFileSync(path.join(curatedDir, "source.fril.jpg"), `fril-${number}`);
        const cardDir = path.join(packRoot, "cards", "nf", "ja", number);
        mkdirSync(cardDir, { recursive: true });
        writeFileSync(path.join(cardDir, "art.ebay.webp"), "ebay-already");
      }

      const report = await installDataCarddassFrilFaces({
        packRoot,
        curatedRoot,
      });
      expect(report.written.sort()).toEqual(["nf/ja/005", "nf/ja/007"]);
      expect(report.failed).toEqual([]);

      for (const number of ["005", "007"]) {
        const cardDir = path.join(packRoot, "cards", "nf", "ja", number);
        expect(existsSync(path.join(cardDir, "art.ebay.webp"))).toBe(true);
        expect(readFileSync(path.join(cardDir, "art.fril.jpg"), "utf8")).toBe(
          `fril-${number}`,
        );
      }
    });
  });
}

// —— installReconstructedFaces ——
{
  const TINY_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  describe("installDataCarddassReconstructedFaces", () => {
    let curatedRoot = "";
    let dataDir = "";
    let previousData: string | undefined;

    const curatedCard = (setCode: string, lang: string, number: string) =>
      path.join(curatedRoot, "cards", setCode, lang, number);

    const installedCard = (setCode: string, lang: string, number: string) =>
      path.join(dataDir, NARUTO_DATA_CARDDASS_PACK_ID, "cards", setCode, lang, number);

    const writeCurated = (
      setCode: string,
      lang: string,
      number: string,
      file: string,
    ) => {
      const dir = curatedCard(setCode, lang, number);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, file), TINY_PNG);
    };

    const seedPrint = (
      index: ReturnType<typeof createLocalPrintsIndex>,
      printKey: string,
      setCode: string,
      number: string,
      fullName: string,
    ) => {
      index.writePrints([
        {
          printKey,
          setCode,
          number,
          cardType: setCode,
          grouping: null,
          category: null,
          titles: [{ lang: "ja", fullName }],
        },
      ]);
    };

    beforeEach(() => {
      curatedRoot = mkdtempSync(path.join(tmpdir(), "dcd-curated-"));
      dataDir = mkdtempSync(path.join(tmpdir(), "dcd-data-"));
      previousData = process.env.PLACARR_DATA_DIR;
      process.env.PLACARR_DATA_DIR = dataDir;
    });

    afterEach(() => {
      process.env.PLACARR_DATA_DIR = previousData;
      rmSync(curatedRoot, { recursive: true, force: true });
      rmSync(dataDir, { recursive: true, force: true });
    });

    it("lists curated reconstructed faces by scanning folder tree", () => {
      writeCurated("dn", "ja", "141t", "art.reconstructed.png");
      const discovered = listCuratedDataCarddassFaces(curatedRoot);
      expect(discovered).toEqual([
        {
          setCode: "dn",
          lang: "ja",
          number: "141t",
          artSource: path.join(curatedCard("dn", "ja", "141t"), "art.reconstructed.png"),
        },
      ]);
    });

    it("installs curated faces as art.reconstructed.webp and writes index assets", async () => {
      writeCurated("dn", "ja", "141t", "source.png");

      const index = createLocalPrintsIndex(NARUTO_DATA_CARDDASS_PACK_ID);
      seedPrint(index, "datacarddass:dn-141t", "dn", "141t", "うずまきナルト");

      const report = await installDataCarddassReconstructedFaces({
        index,
        curatedRoot,
      });

      expect(report.written).toEqual(["dn/ja/141t"]);
      expect(report.failed).toEqual([]);

      const destPath = path.join(installedCard("dn", "ja", "141t"), "art.reconstructed.webp");
      expect(existsSync(destPath)).toBe(true);

      const row = index.lookupRow("datacarddass:dn-141t");
      expect(row?.art).toBe("art.reconstructed.webp");
    });

    it("reads reconstructed ledger when present", () => {
      const sourcesDir = path.join(curatedRoot, "sources");
      mkdirSync(sourcesDir, { recursive: true });
      writeFileSync(
        path.join(sourcesDir, "reconstructed-faces.json"),
        JSON.stringify({
          sourceId: "reconstructed",
          faces: [
            {
              setCode: "dn",
              number: "141t",
              printed: "DN-141T",
              sourceFile: "cards/dn/ja/141t/art.reconstructed.png",
            },
          ],
        }),
      );

      const ledger = readDataCarddassReconstructedFacesLedger(curatedRoot);
      expect(ledger.faces.length).toBe(1);
      expect(ledger.faces[0]?.printed).toBe("DN-141T");
    });
  });
}

// —— chitoroshopFaces ——
{
  describe("normalizeChitoroshopImageUrl", () => {
    it("rewrites cdn.shopify.com to the shop CDN path", () => {
      expect(
        normalizeChitoroshopImageUrl(
          "https://cdn.shopify.com/s/files/1/0560/9589/9815/files/OnePieceTCG.jpg?v=1",
        ),
      ).toBe("https://chitoroshop.com/cdn/shop/files/OnePieceTCG.jpg");
    });
  });

  describe("extractPrintedFromChitoroshopProduct", () => {
    it("maps NX-0271 slug quirk to NX-271", () => {
      expect(
        extractPrintedFromChitoroshopProduct({
          handle: "sarutobi-asuma-nx-0271-foil-narutimate-cross",
          title: "Sarutobi Asuma NX-0271 (Foil) | Narutimate Cross",
        }),
      ).toBe("NX-271");
    });

    it("parses DN-038T from title", () => {
      expect(
        extractPrintedFromChitoroshopProduct({
          handle: "kankuro-dn-038t-narutimet-card-battle",
          title: "Kankuro DN-038T | Narutimet Card Battle",
        }),
      ).toBe("DN-38T");
    });
  });

  describe("facesFromChitoroshopProducts", () => {
    it("dedupes by printed and keeps shop CDN urls", () => {
      const faces = facesFromChitoroshopProducts([
        {
          handle: "a-dn-012t",
          title: "Gaara DN-012T | Narutimet Card Battle",
          images: [
            {
              src: "https://cdn.shopify.com/s/files/1/x/files/a.jpg?v=1",
            },
          ],
        },
        {
          handle: "a-dn-012t-copie",
          title: "Gaara DN-012T (Copie) | Narutimet Card Battle",
          images: [
            {
              src: "https://cdn.shopify.com/s/files/1/x/files/b.jpg",
            },
          ],
        },
      ]);
      expect(faces).toHaveLength(1);
      expect(faces[0]!.printed).toBe("DN-12T");
      expect(faces[0]!.url).toBe(
        "https://chitoroshop.com/cdn/shop/files/a.jpg",
      );
    });
  });

  describe("dataCarddassChitoroshopIngestFaces", () => {
    it("liste des faces ingestibles avec printKey DCD valide", () => {
      const faces = dataCarddassChitoroshopIngestFaces();
      expect(faces.length).toBeGreaterThanOrEqual(100);
      for (const row of faces) {
        expect(parseDataCarddassPrinted(row.printed)).not.toBeNull();
        expect(row.url).toMatch(
          /^https:\/\/(chitoroshop\.com\/cdn\/shop\/files\/|cdn\.shopify\.com\/)/,
        );
      }
      expect(faces.some((f) => f.printed === "NX-271")).toBe(true);
    });
  });
}

// —— ebayFaces ——
{
  describe("dataCarddass ebay faces ledger", () => {
    it("keeps s-l1600 and only ingestible mikanshop faces", () => {
      expect(
        dataCarddassEbayListingImageFull(
          "https://i.ebayimg.com/images/g/jjQAAOSwTONoBbKE/s-l500.webp",
        ),
      ).toBe("https://i.ebayimg.com/images/g/jjQAAOSwTONoBbKE/s-l1600.webp");
      const faces = dataCarddassEbayIngestFaces();
      expect(faces.length).toBeGreaterThanOrEqual(80);
      // NFP promos may omit lang on paste; everything else stays JA.
      expect(
        faces.every((row) => row.lang == null || row.lang === "ja"),
      ).toBe(true);
      expect(
        faces.every((row) => parseDataCarddassPrinted(row.printedRef) !== null),
      ).toBe(true);
      expect(faces.find((row) => row.printedRef === "NF-141")?.title).toBe(
        "Itachi Uchiha",
      );
    });
  });
}

// —— mercariFaces ——
{
  describe("dataCarddass mercari faces ledger", () => {
    it("keeps only ingestible pasted listings with mercdn urls", () => {
      const faces = dataCarddassMercariIngestFaces();
      expect(faces.length).toBeGreaterThan(0);
      expect(
        faces.every(
          (row) =>
            row.ingest &&
            typeof row.url === "string" &&
            row.url.includes("mercdn.net"),
        ),
      ).toBe(true);
      expect(faces.some((row) => row.printedRef === "NF-021")).toBe(true);
    });
  });
}

// —— tvTokyoFaces ——
{
  describe("dataCarddassTvTokyoIngestFaces", () => {
    it("loads 100 official faces from TV Tokyo", () => {
      const faces = dataCarddassTvTokyoIngestFaces();
      expect(faces.length).toBe(100);

      // 18 promos DNP
      const dnp = faces.filter((f) => f.printed.startsWith("DNP-"));
      expect(dnp.length).toBe(18);

      // 82 battle cards DN
      const dn = faces.filter((f) => f.printed.startsWith("DN-"));
      expect(dn.length).toBe(82);

      // All printed refs parse cleanly into Data Carddass sets
      for (const row of faces) {
        const parsed = parseDataCarddassPrinted(row.printed);
        expect(parsed).not.toBeNull();
        expect(["dn", "dnp"]).toContain(parsed!.set);
        expect(row.url).toMatch(/^https:\/\/www\.tv-tokyo\.co\.jp\//);
      }
    });

    it("covers all 10 missing battle cards (DN-048T, DN-056T, ...)", () => {
      const faces = dataCarddassTvTokyoIngestFaces();
      const missing = [
        "DN-048T",
        "DN-056T",
        "DN-061T",
        "DN-067T",
        "DN-068T",
        "DN-072T",
        "DN-075T",
        "DN-076T",
        "DN-078T",
        "DN-081T",
      ];
      for (const code of missing) {
        const found = faces.find((f) => f.printed === code);
        expect(found).toBeDefined();
        expect(found!.url).toContain("cardimg/dcd/");
      }
    });
  });
}

// —— settleDataCarddassFaces ——
{
  describe("settleDataCarddassFaces", () => {
    it("pointe l'index vers Suruga quand eBay est plus grand mais mal cadré", async () => {
      const { settleDataCarddassFaces } = await import("./faces");
      const sharp = (await import("sharp")).default;
      const dataDir = mkdtempSync(path.join(tmpdir(), "dcd-settle-data-"));
      const previousData = process.env.PLACARR_DATA_DIR;
      process.env.PLACARR_DATA_DIR = dataDir;
      try {
        const packRoot = path.join(dataDir, NARUTO_DATA_CARDDASS_PACK_ID);
        const cardDir = path.join(packRoot, "cards", "dmp", "ja", "016");
        mkdirSync(cardDir, { recursive: true });
        await sharp({
          create: {
            width: 349,
            height: 512,
            channels: 3,
            background: { r: 40, g: 80, b: 160 },
          },
        })
          .jpeg()
          .toFile(path.join(cardDir, "art.suruga.jpg"));
        await sharp({
          create: {
            width: 1200,
            height: 1600,
            channels: 3,
            background: { r: 200, g: 180, b: 40 },
          },
        })
          .webp()
          .toFile(path.join(cardDir, "art.ebay.webp"));

        const index = createLocalPrintsIndex(NARUTO_DATA_CARDDASS_PACK_ID);
        index.writePrints([
          {
            printKey: "datacarddass:dmp-016",
            setCode: "dmp",
            number: "016",
            cardType: "dmp",
            grouping: null,
            category: null,
            titles: [{ lang: "ja", fullName: "うずまきナルト" }],
          },
        ]);
        index.writeAssets([
          {
            printKey: "datacarddass:dmp-016",
            lang: "ja",
            art: "art.ebay.webp",
          },
        ]);

        const report = await settleDataCarddassFaces({ packRoot, index });
        expect(report.settled).toBe(1);
        expect(index.lookupRow("datacarddass:dmp-016")?.art).toBe(
          "art.suruga.jpg",
        );
        expect(
          readFileSync(path.join(cardDir, "face.json"), "utf8"),
        ).toContain("art.suruga.jpg");
      } finally {
        if (previousData === undefined) delete process.env.PLACARR_DATA_DIR;
        else process.env.PLACARR_DATA_DIR = previousData;
        rmSync(dataDir, { recursive: true, force: true });
      }
    });
  });
}
