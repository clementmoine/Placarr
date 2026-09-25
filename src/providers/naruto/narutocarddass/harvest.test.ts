import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import official from "./curated/sources/carddass-official-products.json";
import comicplanet from "./curated/sources/comicplanet-de.json";
import gamexfood from "./curated/sources/gamexfood.json";
import liveinternet from "./curated/sources/liveinternet.json";
import driveLedger from "./curated/sources/naruto-ccg-drive.json";
import retrotcg from "./curated/sources/retrotcg.json";
import suruga from "./curated/sources/suruga-ya-kaitori-packshots.json";
import tradecardsonline from "./curated/sources/tradecardsonline.json";
import tvtokyo from "./curated/sources/tvtokyo-goods.json";
import vintage from "./curated/sources/vintage-naruto-ccg.json";
import { DRIVE_HUB_POPULATED_MIN_FILES, driveStagingHubFileCount, driveStagingHubPopulated, NARUTO_STAGING_DRIVE, officialFilesByJan } from "./harvest";
import { VINTAGE_NARUTO_SET_SLUGS, driveHubHarvestRoots } from "./parse/catalogues";
import { volumeNumber, volumeOfficialProducts } from "./sealed";

// —— harvestIndexes ——
{
  describe("liveinternet naruto_boys", () => {
    it("only keeps attachments named on archived posts, not brute-forced ids", () => {
      expect(liveinternet.ingest).toBe("none");
      expect(liveinternet.skip).toContain("brute-force-attach-ids");
      expect(liveinternet.postsFromHub.map((row) => row.number).sort()).toEqual([
        "ni089",
        "ni142",
        "ni155",
        "ta151",
      ]);
      expect(liveinternet.holesNotOnArchivedHub).toEqual([
        "ni232",
        "ni236",
        "ni252",
        "ni253",
        "ta221",
        "ta226",
      ]);
    });
  });

  describe("RetroTCG naruto-ccg", () => {
    it("is the CCG Trader set list, not a second face dump", () => {
      expect(retrotcg.ingest).toBe("none");
      expect(retrotcg.gamesIndexNarutoSlugs).toEqual(["naruto-ccg"]);
      expect(retrotcg.skip).toContain("shinobis-dream");
      expect(retrotcg.sameAssetsAs).toBe("vintage-naruto-ccg.json");
      expect(retrotcg.sampleAssetId).toBe("7le1t5u9evswcck4");
      const official = retrotcg.sets.filter((slug) => slug !== "shinobis-dream");
      expect(new Set(official)).toEqual(
        new Set(Object.keys(VINTAGE_NARUTO_SET_SLUGS)),
      );
      expect(retrotcg.tins).toEqual([
        "fierce-ambitions",
        "untouchables",
        "ultimate-battle",
        "rebirth",
      ]);
      expect(vintage.ingest).toBe("faces");
    });
  });

  describe("TradeCardsOnline game 48 Wayback 2008", () => {
    it("recovered the search form without ingesting dream-card faces", () => {
      expect(tradecardsonline.ingest).toBe("none");
      expect(tradecardsonline.wayback.htmlThisSession).toBe(true);
      expect(tradecardsonline.wayback.timestamp).toBe("20081205121420");
      expect(tradecardsonline.series2008.map((row) => row.setCode)).toEqual([
        "s1",
        "s2",
        "s3",
        "s4",
        "s5",
        "s6",
        "s7",
        "s8",
        "s9",
        "s10",
        "promo",
      ]);
      expect(tradecardsonline.types2008).toEqual([
        "Ninja",
        "Jutsu",
        "Mission",
        "Client",
      ]);
      expect(tradecardsonline.related.dreamCards).toContain("goal/DC");
    });
  });

  describe("GameXFood S6 IT booster URL", () => {
    it("records the 404 without inventing another product path", () => {
      expect(gamexfood.ingest).toBe("none");
      expect(gamexfood.status).toBe(404);
      expect(gamexfood.skip).toContain("site-wide-crawl");
    });
  });
}

// —— harvestNarutoCcgDriveStaging ——
{
  describe("harvestNarutoCcgDriveStaging ledger", () => {
    it("archives every top-level hub folder", () => {
      expect(driveLedger.ingest).toBe("staging+faces");
      expect(driveLedger.download).toBe(true);
      expect(driveHubHarvestRoots()).toHaveLength(driveLedger.folders.length);
    });
  });

  describe("driveStagingHubPopulated", () => {
    it("detects localExport manifest without walking hub", () => {
      const packRoot = mkdtempSync(path.join(tmpdir(), "drive-hub-"));
      const staging = path.join(packRoot, NARUTO_STAGING_DRIVE);
      mkdirSync(path.join(staging, "hub"), { recursive: true });
      writeFileSync(
        path.join(staging, "manifest.json"),
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          hubUrl: driveLedger.url,
          localExport: true,
          fileCount: 5450,
          roots: [],
        }),
      );
      expect(driveStagingHubPopulated(packRoot)).toBe(true);
      expect(driveStagingHubFileCount(packRoot)).toBe(5450);
    });

    it("detects populated hub by file count when manifest is absent", () => {
      const packRoot = mkdtempSync(path.join(tmpdir(), "drive-hub-"));
      const hub = path.join(packRoot, NARUTO_STAGING_DRIVE, "hub", "nested");
      mkdirSync(hub, { recursive: true });
      for (let i = 0; i < DRIVE_HUB_POPULATED_MIN_FILES; i += 1) {
        writeFileSync(path.join(hub, `f${i}.png`), "x");
      }
      expect(driveStagingHubPopulated(packRoot)).toBe(true);
      expect(driveStagingHubFileCount(packRoot)).toBe(
        DRIVE_HUB_POPULATED_MIN_FILES,
      );
    });

    it("returns false for empty staging", () => {
      const packRoot = mkdtempSync(path.join(tmpdir(), "drive-hub-"));
      expect(driveStagingHubPopulated(packRoot)).toBe(false);
    });
  });
}

// —— harvestProductPackshots ——
{
  /*
    `staging/` doit se reconstruire depuis un relevé. Ces tests ne téléchargent
    rien : ils vérifient que chaque fichier qu'un spec attend en staging a bien
    une ligne de relevé derrière lui — sans quoi la moisson laisserait un trou
    qu'aucune erreur ne signalerait.
  */
  describe("chaque visuel de staging a son relevé", () => {
    /*
      Les specs du 疾風伝 sont parties avec leur jeu le 2026-08-21, et son pack
      porte le même test sur son propre relevé. Ici : les 巻ノ, et eux seuls.
    */
    it("couvre les specs 巻ノ par un JAN de la base Bandai", () => {
      const jans = new Set(official.products.map((p) => p.jan));
      const specs = volumeOfficialProducts()
        .map((spec) => spec.jan)
        .filter((jan): jan is string => Boolean(jan));
      expect(specs.length).toBeGreaterThan(0);
      for (const jan of specs) {
        expect(jans.has(jan)).toBe(true);
      }
    });

    it("donne une image à chaque produit officiel qu'un spec réclame", () => {
      const wanted = new Set(
        volumeOfficialProducts()
          .map((s) => s.jan)
          .filter((jan): jan is string => Boolean(jan)),
      );
      for (const row of official.products) {
        if (!wanted.has(row.jan)) continue;
        expect(row.image).toBeTruthy();
      }
    });

    it("remoissonne aussi les sachets booster 12/16/17 (pas seulement vending)", () => {
      const byJan = officialFilesByJan();
      const boosterFiles = [...byJan.values()].filter((f) =>
        /^booster-vol(12|16|17)-jp\.jpg$/.test(f),
      );
      expect(boosterFiles.sort()).toEqual([
        "booster-vol12-jp.jpg",
        "booster-vol16-jp.jpg",
        "booster-vol17-jp.jpg",
      ]);
      for (const row of official.products) {
        const volume = volumeNumber(row.title);
        if (volume == null || ![12, 16, 17].includes(volume)) continue;
        if (!/ブースターパック/.test(row.title)) continue;
        expect(byJan.get(row.jan)).toBe(`booster-vol${volume}-jp.jpg`);
      }
    });

    it("nomme chaque packshot allemand d'après son slug", () => {
      for (const row of comicplanet.products) {
        expect(row.slug).toMatch(/^(booster|display)-s\d{1,2}-de$/);
        expect(row.image).toBeTruthy();
      }
    });

    it("garde un identifiant Suruga par SKU, jamais une URL de page", () => {
      // Le site est derrière Cloudflare : seul le CDN est interrogé, par id.
      for (const row of suruga.products) {
        expect(row.id).toMatch(/^\d{9,}$/);
        expect(row.slug.length).toBeGreaterThan(0);
      }
    });

    it("moissonne toutes les vignettes TV Tokyo vol.1–11 (plus variantes)", () => {
      const vols = new Set(
        tvtokyo.products
          .map((row) => row.volumeNumber)
          .filter((n): n is number => typeof n === "number" && n > 0),
      );
      expect([...vols].sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
      ]);
      expect(tvtokyo.products.some((row) => row.file === "card_package5s.jpg")).toBe(
        true,
      );
      expect(tvtokyo.products.some((row) => row.file === "card_package6s.jpg")).toBe(
        true,
      );
    });
  });
}

