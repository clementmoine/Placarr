import { afterEach, describe, expect, it, vi } from "vitest";
import fs, { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { ebayBrowseItemId } from "@/providers/commerce/ebay/browseItem";
import { packCardsDir, packProductsIndexPath, packSealedProductsDir } from "@/lib/packPaths";
import {
  bloggerPackRipSkippedReasons,
  installBloggerPackRip,
  readBloggerPackRipLedger,
  colekaBackOnlyStagingFile,
  installColekaNinjaRanks,
  readColekaNinjaRanksLedger,
  ingestInkworksProducts,
  readInkworksProductsLedger,
  parseAnimeCollectionRanksBackImageId,
  parseAnimeCollectionRanksFaces,
  ranksSetForAcPrinted,
  ranksSetForAcPrintedLabel,
  readEbayNinjaRanksLedger,
} from "./faces";
import { buildNinjaRanksFromLedgers } from "../pipeline/ledgers";
import { NARUTO_RANKS_PACK_ID } from "../pack";

// —— animecollectionFaces ——
{
  describe("ranksSetForAcPrintedLabel", () => {
    it("maps base grid 1–72 to nr", () => {
      expect(ranksSetForAcPrinted(1)).toEqual({ set: "nr", number: "0001" });
      expect(ranksSetForAcPrinted(72)).toEqual({ set: "nr", number: "0072" });
      expect(ranksSetForAcPrinted(73)).toBeNull();
    });

    it("maps insert labels including GS → bl", () => {
      expect(ranksSetForAcPrintedLabel("FF6")).toEqual({
        set: "ff",
        number: "0006",
      });
      expect(ranksSetForAcPrintedLabel("NW9")).toEqual({
        set: "nw",
        number: "0009",
      });
      expect(ranksSetForAcPrintedLabel("SD1")).toEqual({
        set: "sd",
        number: "0001",
      });
      expect(ranksSetForAcPrintedLabel("NS3")).toEqual({
        set: "ns",
        number: "0003",
      });
      expect(ranksSetForAcPrintedLabel("GS2")).toEqual({
        set: "bl",
        number: "0002",
      });
    });
  });

  describe("parseAnimeCollectionRanksFaces", () => {
    it("reads numbered tiles and inserts", () => {
      const html = `
        <div class="bc_texte_numero">12</div>
        <img onclick="afficher_detail('9912','87/200/h400_9912');" src="h100_9912_carte.jpg">
        <div class="bc_texte_numero">12</div>
        <img onclick="afficher_detail('9912','87/200/h400_9912');" src="h100_9912_carte.jpg">
        <div class="bc_texte_numero">FF6</div>
        <img onclick="afficher_detail('7916','87/200/h400_7916');" src="h100_7916_carte.jpg">
        <div class="bc_texte_numero">GS1</div>
        <img onclick="afficher_detail('7938','87/200/h400_7938');" src="h100_7938_carte.jpg">
        <div class="bc_texte_numero">Booster Box</div>
        <img onclick="afficher_detail_pack('342','87/200/h400_342');">
      `;
      expect(parseAnimeCollectionRanksFaces(html)).toEqual([
        { printed: "GS1", set: "bl", number: "0001", acId: "7938" },
        { printed: "FF6", set: "ff", number: "0006", acId: "7916" },
        { printed: "12", set: "nr", number: "0012", acId: "9912" },
      ]);
    });
  });

  describe("parseAnimeCollectionRanksBackImageId", () => {
    it("reads Dos de la carte image id", () => {
      const html = `
        <div class="bc_texte_numero">Dos de la carte</div>
        <img onclick="masquer_detail(); afficher_detail_img('440','87/200/7916/h400_440','7916');"
             src="cartes/87/200/7916/h100_440_carte_image.jpg" />
      `;
      expect(parseAnimeCollectionRanksBackImageId(html)).toBe("440");
    });
  });
}

// —— colekaNinjaRanks ——
{
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  function tmpDataRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "coleka-nr-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    return root;
  }

  describe("colekaBackOnlyStagingFile", () => {
    it("range le verso attesté sur fiche item sous le numéro de tirage", () => {
      expect(
        colekaBackOnlyStagingFile(
          "0003",
          "https://www.coleka.com/media/item/202205/23/coleka-carte-panini-naruto.webp",
        ),
      ).toBe("0003-back.webp");
    });
  });

  describe("readColekaNinjaRanksLedger", () => {
    it("documente le verso FR de la carte de base 3, pas GS03/bl-0003", () => {
      const row = readColekaNinjaRanksLedger().backOnly?.find(
        (entry) => entry.number === "0003",
      );
      expect(row).toMatchObject({
        setCode: "nr",
        colekaRef: 3,
        colekaId: "1188740",
        pageUrl: expect.stringContaining("groupe-7-kakashi-sasuke_i1188740"),
      });
      expect(row!.backUrl).toContain("coleka-carte-panini-naruto.webp");
    });
  });

  describe("installColekaNinjaRanks", () => {
    it("pose un verso seul sur le set attesté, sans inventer de recto", () => {
      tmpDataRoot();
      const staging = path.join(os.tmpdir(), `coleka-nr-install-${Date.now()}`);
      roots.push(staging);
      fs.mkdirSync(staging, { recursive: true });
      fs.writeFileSync(path.join(staging, "0003-back.webp"), "fake-back");

      const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
      index.writePrints([
        {
          printKey: "naruto:nr-0003",
          setCode: "nr",
          number: "0003",
          cardType: "nr",
          titles: [
            { lang: "en", fullName: "Group 7 puzzle" },
            { lang: "fr", fullName: "Groupe 7 puzzle" },
          ],
        },
      ]);

      const report = installColekaNinjaRanks(index, { stagingDir: staging });
      expect(report).toMatchObject({ faces: 0, backs: 1, missing: [] });

      const cardDir = path.join(
        process.env.PLACARR_DATA_DIR!,
        "naruto",
        "ninja-ranks",
        "cards",
        "nr",
        "fr",
        "0003",
      );
      expect(fs.existsSync(path.join(cardDir, "back.coleka.webp"))).toBe(true);
      expect(fs.existsSync(path.join(cardDir, "art.coleka.webp"))).toBe(false);

      const exported = index.exportIndex();
      const entry = (
        JSON.parse(fs.readFileSync(exported!.path, "utf8")) as {
          cards: Record<
            string,
            { langs: Record<string, { art?: string; back?: string }> }
          >;
        }
      ).cards["naruto:nr-0003"];
      expect(entry.langs.fr?.back).toBe("back.coleka.webp");
      expect(entry.langs.fr?.art).toBeUndefined();
    });

    it("refuse un recto Coleka reflété et le retire de l'index", () => {
      tmpDataRoot();
      const staging = path.join(os.tmpdir(), `coleka-nr-reject-${Date.now()}`);
      roots.push(staging);
      fs.mkdirSync(staging, { recursive: true });
      fs.writeFileSync(
        path.join(staging, "listing-0.html"),
        `<a class="lib_has_2_lines" href="/x"><img src="https://thumbs.coleka.com/media/item/x/naruto-ninja-ranks-carte-ff2-ff02_250x250.webp"><h3 class="product-title">FF2</h3><span class="ref"> Ref. FF02 </span></a>`,
      );
      fs.writeFileSync(path.join(staging, "ff-0002.webp"), "fake-front");

      const ledgerPath = path.join(
        process.cwd(),
        "src/providers/naruto/narutoranks/curated/sources/coleka-ninja-ranks.json",
      );
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as {
        rejectedFaces?: { setCode?: string; number: string; reason?: string }[];
      };
      const hadRejected = ledger.rejectedFaces?.some(
        (row) => row.setCode === "ff" && row.number === "0002",
      );
      if (!hadRejected) {
        ledger.rejectedFaces = [
          ...(ledger.rejectedFaces ?? []),
          { setCode: "ff", number: "0002", reason: "test" },
        ];
        fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
      }

      const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
      index.writePrints([
        {
          printKey: "naruto:ff-0002",
          setCode: "ff",
          number: "0002",
          cardType: "ff",
          titles: [{ lang: "en", fullName: "Naruto - Fox Spirit" }],
        },
      ]);
      index.writeAssets([
        {
          printKey: "naruto:ff-0002",
          lang: "fr",
          art: "art.coleka.webp",
        },
      ]);

      const cardDir = path.join(
        process.env.PLACARR_DATA_DIR!,
        "naruto",
        "ninja-ranks",
        "cards",
        "ff",
        "fr",
        "0002",
      );
      fs.mkdirSync(cardDir, { recursive: true });
      fs.writeFileSync(path.join(cardDir, "art.coleka.webp"), "old-glare");

      const report = installColekaNinjaRanks(index, { stagingDir: staging });
      expect(report.faces).toBe(0);
      expect(fs.existsSync(path.join(cardDir, "art.coleka.webp"))).toBe(true);

      const exported = index.exportIndex();
      const entry = (
        JSON.parse(fs.readFileSync(exported!.path, "utf8")) as {
          cards: Record<string, { langs: Record<string, { art?: string }> }>;
        }
      ).cards["naruto:ff-0002"];
      expect(entry.langs.fr?.art).toBeUndefined();
    });

    it("retire le faux recto Coleka GS03 (fiche base 3) de bl-0003", () => {
      tmpDataRoot();
      const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
      index.writePrints([
        {
          printKey: "naruto:bl-0003",
          setCode: "bl",
          number: "0003",
          cardType: "bl",
          titles: [
            { lang: "en", fullName: "Sasuke" },
            { lang: "fr", fullName: "Sasuke" },
          ],
        },
      ]);
      index.writeAssets([
        {
          printKey: "naruto:bl-0003",
          lang: "fr",
          art: "art.coleka.webp",
        },
        {
          printKey: "naruto:bl-0003",
          lang: "en",
          art: "art.imadoki.jpg",
        },
      ]);

      const cardDir = path.join(
        process.env.PLACARR_DATA_DIR!,
        "naruto",
        "ninja-ranks",
        "cards",
        "bl",
        "fr",
        "0003",
      );
      fs.mkdirSync(cardDir, { recursive: true });
      fs.writeFileSync(path.join(cardDir, "art.coleka.webp"), "wrong-base-3");

      installColekaNinjaRanks(index, { stagingDir: path.join(os.tmpdir(), "missing") });

      const exported = index.exportIndex();
      const entry = (
        JSON.parse(fs.readFileSync(exported!.path, "utf8")) as {
          cards: Record<string, { langs: Record<string, { art?: string }> }>;
        }
      ).cards["naruto:bl-0003"];
      expect(entry.langs.fr?.art).toBeUndefined();
      expect(entry.langs.en?.art).toBe("art.imadoki.jpg");
      expect(fs.existsSync(path.join(cardDir, "art.coleka.webp"))).toBe(true);
    });

    it("pose un insert EU sous le bon set", () => {
      tmpDataRoot();
      const staging = path.join(os.tmpdir(), `coleka-nr-insert-${Date.now()}`);
      roots.push(staging);
      fs.mkdirSync(staging, { recursive: true });
      fs.writeFileSync(
        path.join(staging, "listing-0.html"),
        `<a class="lib_has_2_lines" href="/x"><img src="https://thumbs.coleka.com/media/item/x/naruto-ninja-ranks-carte-ff1-ff01_250x250.webp"><h3 class="product-title">FF1</h3><span class="ref"> Ref. FF01 </span></a>`,
      );
      fs.writeFileSync(path.join(staging, "ff-0001.webp"), "fake-front");

      const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
      index.writePrints([
        {
          printKey: "naruto:ff-0001",
          setCode: "ff",
          number: "0001",
          cardType: "ff",
          titles: [{ lang: "en", fullName: "Flash Forward 1" }],
        },
      ]);

      const report = installColekaNinjaRanks(index, { stagingDir: staging });
      expect(report).toMatchObject({ faces: 1, backs: 0 });
      expect(report.missing).not.toContain("ff-0001");

      const cardDir = path.join(
        process.env.PLACARR_DATA_DIR!,
        "naruto",
        "ninja-ranks",
        "cards",
        "ff",
        "fr",
        "0001",
      );
      expect(fs.existsSync(path.join(cardDir, "art.coleka.webp"))).toBe(true);
    });
  });
}

// —— ebayAssets ——
{
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  describe("ebay-ninja-ranks ledger", () => {
    it("documents expired pick-a-card and live sell sheet", () => {
      const ledger = readEbayNinjaRanksLedger();
      expect(ledger.marketplaceId).toBe("EBAY_US");
      expect(
        ledger.listings.find((row) => row.legacyItemId === "293490000296")?.state,
      ).toBe("expired");
      expect(
        ledger.listings.find((row) => row.legacyItemId === "403984180609")
          ?.ingest,
      ).toBe("staging");
      expect(ebayBrowseItemId("127955574207", "429137825416")).toBe(
        "v1|127955574207|429137825416",
      );
    });
  });
}

// —— unofficialVisuals ——
{
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  function tmpDataRoot(): string {
    const root = mkdtempSync(path.join(os.tmpdir(), "blogger-rip-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    return root;
  }

  const TINY = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

  function stageRip(): string {
    const staging = mkdtempSync(path.join(os.tmpdir(), "blogger-stage-"));
    roots.push(staging);
    const ledger = readBloggerPackRipLedger();
    for (const asset of ledger.assets) {
      writeFileSync(path.join(staging, asset.file), TINY);
    }
    return staging;
  }

  describe("Ninja Ranks unofficial dumps", () => {
    it("keeps the 3×3 pack grid and the TDmonthly tin off the catalogue", () => {
      const ledger = readBloggerPackRipLedger();
      expect(ledger.assets.map((row) => row.role).sort()).toEqual([
        "card-art",
        "card-back",
        "product-art",
      ]);
      expect(ledger.assets.some((row) => row.printed === "SD-4")).toBe(true);
      expect(bloggerPackRipSkippedReasons().join(" ")).toMatch(/collage/i);
      expect(bloggerPackRipSkippedReasons().join(" ")).toMatch(/tin/i);
    });

    it("dumps the green wrap beside the official yellow packshot, not as a SKU", () => {
      tmpDataRoot();
      const official = mkdtempSync(path.join(os.tmpdir(), "inkworks-stage-"));
      roots.push(official);
      const inkworks = readInkworksProductsLedger();
      for (const sku of inkworks.skus) {
        writeFileSync(path.join(official, sku.art), TINY);
      }
      writeFileSync(path.join(official, inkworks.logo.file), TINY);
      // Ce test porte sur le dump fan à côté du packshot éditeur : on écarte
      // les packshots curés, qui prendraient sinon la place affichée.
      ingestInkworksProducts({
        stagingDir: official,
        curatedProductsDir: path.join(official, "no-curated"),
      });

      const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
      buildNinjaRanksFromLedgers({ index });
      const report = installBloggerPackRip(index, { stagingDir: stageRip() });
      expect(report).toMatchObject({
        cards: 1,
        products: 1,
        backs: 1,
        skipped: [],
      });

      const boosterDir = path.join(
        packSealedProductsDir(NARUTO_RANKS_PACK_ID),
        "booster",
        "en",
      );
      expect(existsSync(path.join(boosterDir, "art.inkworks.jpg"))).toBe(true);
      expect(existsSync(path.join(boosterDir, "art.blogger.jpg"))).toBe(true);

      const products = JSON.parse(
        readFileSync(packProductsIndexPath(NARUTO_RANKS_PACK_ID), "utf8"),
      ) as {
        products: Record<string, { image: string; slug: string }>;
      };
      expect(Object.keys(products.products).sort()).toEqual([
        "naruto/ninja-ranks::booster",
        "naruto/ninja-ranks::collector-album",
        "naruto/ninja-ranks::display",
      ]);
      expect(products.products["naruto/ninja-ranks::booster"]?.image).toBe(
        "/assets/naruto/ninja-ranks/products/booster/en/art.inkworks.jpg",
      );
      expect(Object.keys(products.products).some((key) => /tin/i.test(key))).toBe(
        false,
      );
    });

    it("installs SD-4 as a blogger dump and leaves official samples alone", () => {
      tmpDataRoot();
      const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
      buildNinjaRanksFromLedgers({ index });
      installBloggerPackRip(index, { stagingDir: stageRip() });

      expect(index.lookupRow("naruto:sd-0004")?.art).toBe("art.blogger.jpg");
      expect(index.lookupRow("naruto:sd-0001")?.art).toBeNull();
      expect(
        existsSync(
          path.join(
            packCardsDir(NARUTO_RANKS_PACK_ID),
            "sd",
            "en",
            "0004",
            "art.blogger.jpg",
          ),
        ),
      ).toBe(true);
      expect(
        existsSync(
          path.join(
            packCardsDir(NARUTO_RANKS_PACK_ID),
            "sd",
            "en",
            "0004",
            "back.blogger.jpg",
          ),
        ),
      ).toBe(true);
      expect(
        existsSync(path.join(packCardsDir(NARUTO_RANKS_PACK_ID), "back.fr.webp")),
      ).toBe(false);
    });
  });
}
