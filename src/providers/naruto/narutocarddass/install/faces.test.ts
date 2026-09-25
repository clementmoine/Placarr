import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import ledger from "../curated/sources/carddas-jp-double-illustrations.json";
import driveLedger from "../curated/sources/naruto-ccg-drive.json";
import { NARUTO_FACE_DECISION_FILE } from "../disk";
import { NARUTO_STAGING_DRIVE } from "../harvest";
import { narutoDiskCardId } from "../identity";
import { driveEnhancedFolders } from "../parse/catalogues";
import { installMercariFaces, installTvTokyoFaces, installYahooAuctionFaces, installNarutoCcgDriveFansetFallbacks, carddasDoubleGifBasename, goatLocalePromoFaceLedger, goatLocalePromoIngestFaces, leboncoinFaceLedger, leboncoinIngestFaces, leboncoinListingImageFull } from "./faces";
import sharp from "sharp";

// —— installMercariFaces ——
{
  const dirs: string[] = [];

  function tmp(): string {
    const dir = path.join(
      os.tmpdir(),
      `naruto-mercari-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(dir, { recursive: true });
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe("installMercariFaces", () => {
    it("fetches mercdn url as art.mercari for 巻ノ壱 忍-3", async () => {
      const packRoot = tmp();
      const jpeg = await sharp({
        create: {
          width: 40,
          height: 56,
          channels: 3,
          background: { r: 220, g: 80, b: 120 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await installMercariFaces({
        packRoot,
        force: true,
        fetchImage: async (url) =>
          url.includes("m63902869042") ? jpeg : null,
      });
      expect(result.written).toContain("ni0003/ja");
      const dest = path.join(
        packRoot,
        "cards",
        "ninja",
        "ni0003",
        "ja",
        "art.mercari.jpg",
      );
      expect(readFileSync(dest).equals(jpeg)).toBe(true);
      const decision = JSON.parse(
        readFileSync(
          path.join(
            packRoot,
            "cards",
            "ninja",
            "ni0003",
            "ja",
            NARUTO_FACE_DECISION_FILE,
          ),
          "utf8",
        ),
      ) as { art: string };
      expect(decision.art).toBe("art.mercari.jpg");
    });
  });
}

// —— installTvTokyoFaces ——
{
  const dirs: string[] = [];

  function tmp(): string {
    const dir = path.join(
      os.tmpdir(),
      `naruto-tvtokyo-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(dir, { recursive: true });
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe("installTvTokyoFaces", () => {
    it("downloads and installs TV Tokyo art on disk", async () => {
      const packRoot = tmp();
      const fakeJpeg = await sharp({
        create: {
          width: 80,
          height: 117,
          channels: 3,
          background: { r: 255, g: 128, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      let fetched = 0;
      const result = await installTvTokyoFaces({
        packRoot,
        force: true,
        fetchImage: async (_url: string) => {
          fetched++;
          // Limit to 3 cards for test speed
          if (fetched > 3) return null;
          return fakeJpeg;
        },
      });

      expect(result.written.length).toBe(3);
      expect(result.written.some((k) => k.startsWith("ni0001/ja/"))).toBe(true);

      const installedFile = path.join(
        packRoot,
        "cards",
        "ninja",
        "ni0001",
        "ja",
        "art.tvtokyo.jpg",
      );
      expect(existsSync(installedFile)).toBe(true);

      const decisionFile = path.join(
        packRoot,
        "cards",
        "ninja",
        "ni0001",
        "ja",
        NARUTO_FACE_DECISION_FILE,
      );
      expect(existsSync(decisionFile)).toBe(true);
    }, 30_000);
  });
}

// —— installYahooAuctionFaces ——
{
  const dirs: string[] = [];

  function tmp(): string {
    const dir = path.join(
      os.tmpdir(),
      `naruto-yahoo-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(dir, { recursive: true });
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe("installYahooAuctionFaces", () => {
    it("copies curated source.jpg as art.yahoo and does not mint 忍-3", async () => {
      const packRoot = tmp();
      const curatedRoot = tmp();
      const srcDir = path.join(curatedRoot, "cards", "ninja", "ni0019", "ja");
      mkdirSync(srcDir, { recursive: true });
      const jpeg = await sharp({
        create: {
          width: 40,
          height: 56,
          channels: 3,
          background: { r: 200, g: 40, b: 40 },
        },
      })
        .jpeg()
        .toBuffer();
      writeFileSync(path.join(srcDir, "source.jpg"), jpeg);

      const result = await installYahooAuctionFaces({
        packRoot,
        curatedRoot,
        force: true,
      });
      expect(result.written).toContain("ni0019/ja");
      expect(result.written).not.toContain("ni0003/ja");
      const dest = path.join(
        packRoot,
        "cards",
        "ninja",
        "ni0019",
        "ja",
        "art.yahoo.jpg",
      );
      expect(readFileSync(dest).equals(jpeg)).toBe(true);
      const decision = JSON.parse(
        readFileSync(
          path.join(
            packRoot,
            "cards",
            "ninja",
            "ni0019",
            "ja",
            NARUTO_FACE_DECISION_FILE,
          ),
          "utf8",
        ),
      ) as { art: string };
      expect(decision.art).toBe("art.yahoo.jpg");
    });
  });
}

// —— installNarutoCcgDriveFaces ——
{
  const dirs: string[] = [];

  function tmp(): string {
    const dir = path.join(
      os.tmpdir(),
      `naruto-drive-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(dir, { recursive: true });
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function png(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 20, g: 40, b: 80 },
      },
    })
      .png()
      .toBuffer();
  }

  describe("installNarutoCcgDriveFaces ledger", () => {
    it("lists 33 Enhanced folders (s1–s28 + TP + promos)", () => {
      expect(driveLedger.ingest).toBe("staging+faces");
      expect(driveLedger.download).toBe(true);
      expect(driveLedger.cardDatabase.enhanced.ingest).toBe("faces");
      expect(driveEnhancedFolders()).toHaveLength(33);
      expect(driveEnhancedFolders().map((row) => row.setCode)).toContain("s28");
      expect(driveEnhancedFolders().map((row) => row.setCode)).toContain("tp4");
      expect(driveEnhancedFolders().map((row) => row.setCode)).toContain("promo");
    });

    it("content hash is observed|folderId for harvest skip after purge", () => {
      const hash = `${driveLedger.observed}|${driveLedger.folderId}`;
      expect(hash).toMatch(/^\d{4}-\d{2}-\d{2}\|/);
      expect(driveLedger.folderId.length).toBeGreaterThan(10);
    });
  });

  describe("installNarutoCcgDriveFansetFallbacks", () => {
    it("copies onto an existing card and does not mint a fanset-only number", async () => {
      const packRoot = tmp();
      const fansetDir = path.join(
        packRoot,
        NARUTO_STAGING_DRIVE,
        "hub",
        "Card Database",
        "[Fansets] Naruto CCG Sets Database",
        "Set 30 - Naruto CCG (Fan Made - Henrich)",
      );
      mkdirSync(fansetDir, { recursive: true });
      writeFileSync(path.join(fansetDir, "n001.png"), await png(40, 56));
      writeFileSync(path.join(fansetDir, "n1715.png"), await png(40, 56));

      const existing = path.join(packRoot, "cards", "ninja", "n0001", "en");
      mkdirSync(existing, { recursive: true });
      writeFileSync(
        path.join(existing, "art.vintage.jpg"),
        await sharp({
          create: {
            width: 20,
            height: 28,
            channels: 3,
            background: { r: 80, g: 20, b: 20 },
          },
        })
          .jpeg()
          .toBuffer(),
      );

      const stats = await installNarutoCcgDriveFansetFallbacks({ packRoot });
      expect(stats.written).toContain("n0001/en");
      expect(existsSync(path.join(existing, "art.fanset.webp"))).toBe(true);
      const decision = JSON.parse(
        readFileSync(path.join(existing, NARUTO_FACE_DECISION_FILE), "utf8"),
      ) as { art?: string };
      expect(decision.art).toBe("art.vintage.jpg");
      expect(existsSync(path.join(packRoot, "cards", "ninja", "n1715"))).toBe(
        false,
      );
    });
  });
}

// —— installCarddasDoubleIllustrationFaces ——
{
  describe("carddas double illustrations", () => {
    it("lists three official GIF doubles plus shop-attested 作-257", () => {
      expect(ledger.cards.map((c) => c.number)).toEqual([
        "te0192",
        "te0348",
        "te0358",
        "ta0257",
        "ta0316",
      ]);
      expect(
        ledger.cards
          .filter((c) => c.gif)
          .map((c) => carddasDoubleGifBasename(c.gif!)),
      ).toEqual([
        "jutsu-192_10.gif",
        "jutsu-348_17.gif",
        "jutsu-358_17.gif",
      ]);
      expect(ledger.cards.find((c) => c.number === "ta0257")).toMatchObject({
        artA: "art.suruga.jpg",
        artB: "art.chitoroshop.jpg",
        gif: null,
      });
    });
  });
}

// —— installGoatLocalePromoFaces ——
{
  describe("installGoatLocalePromoFaces ledger", () => {
    it("pastes only attested Goat French Foil CDNs", () => {
      const faces = goatLocalePromoIngestFaces();
      expect(faces).toHaveLength(1);
      expect(faces[0]).toMatchObject({
        printedRef: "PR-100",
        lang: "fr",
        setCode: "promo",
        ingest: true,
      });
      expect(faces[0]!.url).toContain("pr-100%20french.jpg");
      expect(goatLocalePromoFaceLedger().skus.map((row) => row.ref)).toEqual([
        "PR-095",
        "PR-096",
        "PR-100",
      ]);
    });
  });
}

// —— leboncoinFaces ——
{
  describe("leboncoin pasted faces", () => {
    it("keeps PR-096 as a pasted CDN URL, not a store crawl", () => {
      const ledger = leboncoinFaceLedger();
      expect(ledger.ingestCollection).toBe(false);
      const faces = leboncoinIngestFaces();
      expect(faces).toHaveLength(1);
      expect(faces[0]).toMatchObject({
        printedRef: "PR-096",
        lang: "fr",
        setCode: "promo",
        ingest: true,
      });
      expect(faces[0]?.listing).toContain("/ad/collection/3233037633");
      expect(narutoDiskCardId(faces[0]!.printedRef)).toBe("pr0096");
      expect(leboncoinListingImageFull(faces[0]!.url)).toContain("rule=ad-large");
    });
  });
}

