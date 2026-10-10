import { describe, expect, it } from "vitest";
import type { CardsIndexEntry } from "@/effects/cardsIndex";
import {
  inferKayouLenticularCropProfile,
  inferKayouLenticularGrid,
  inferKayouScanCrop,
  KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE,
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2,
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3,
  kayouCardNumberIsCcRotatedLandscapeWave,
  kayouCardNumberIsCcSeries,
  kayouCardNumberIsCompactPivotRarity,
  kayouCardNumberIsHrOrMr,
  kayouEntryUsesRotatedLandscapeHeuristic,
  kayouNameLooksLikeStoryPanel,
  kayouRowSeamWhiteFraction,
  kayouScanIsLenticularStrip,
  kayouScanIsRotatedLandscape,
  probeKayouStackedStripGrid,
} from "./lenticular";

// —— lenticularGrid ——
{
  function entry(
    partial: Partial<CardsIndexEntry> & Pick<CardsIndexEntry, "set" | "card">,
  ): CardsIndexEntry {
    return {
      langs: { en: { artW: 320, artH: 450 } },
      rarity: "HR",
      ...partial,
    };
  }

  describe("kayouLenticularGrid", () => {
    it("detects standard portrait strips", () => {
      expect(kayouScanIsLenticularStrip(320, 450)).toBe(true);
      expect(kayouScanIsLenticularStrip(768, 1076)).toBe(true);
      expect(kayouScanIsLenticularStrip(450, 320)).toBe(false);
      expect(kayouScanIsLenticularStrip(282, 411)).toBe(false);
    });

    it("maps Heaven Scroll HR cards to attested grids without pixel probe", () => {
      expect(
        inferKayouLenticularGrid(
          entry({ set: "smritiheavenscrolls1", card: "nrss.hr.002" }),
        ),
      ).toEqual({ cols: 2, rows: 2 });
      expect(
        inferKayouLenticularGrid(
          entry({ set: "smritiheavenscrolls1", card: "nrss.hr.005" }),
        ),
      ).toEqual({ cols: 2, rows: 3 });
    });

    it("does not guess t4w4 strips without a seam probe", () => {
      expect(
        inferKayouLenticularGrid(entry({ set: "t4w4", card: "nr.hr.121" })),
      ).toBeNull();
    });

    it("infers t4w4 dual-face strips when seams are present in RGBA", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");
      const art =
        "data/naruto/kayou/cards/t4w4/en/nr.hr.121/art.narutocards.webp";
      if (!existsSync(art)) return;

      const { data, info } = await sharp(readFileSync(art))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const probe = {
        rgba: new Uint8ClampedArray(data),
        width: info.width,
        height: info.height,
      };
      expect(probeKayouStackedStripGrid(probe.rgba, probe.width, probe.height)).toEqual({
        cols: 1,
        rows: 2,
      });
      expect(
        inferKayouLenticularGrid(entry({ set: "t4w4", card: "nr.hr.121" }), probe),
      ).toEqual({ cols: 1, rows: 2 });
    });

    it("assigns fixed dual-wave crop profile to t4w* nr.hr.* 1×2 strips", () => {
      expect(
        inferKayouLenticularCropProfile(
          entry({ set: "t4w4", card: "nr.hr.121" }),
          { cols: 1, rows: 2 },
        ),
      ).toBe(KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE);
      expect(
        inferKayouLenticularCropProfile(
          entry({ set: "t4w5", card: "nr.hr.163" }),
          { cols: 1, rows: 2 },
        ),
      ).toBe(KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE);
      expect(
        inferKayouLenticularCropProfile(
          entry({ set: "smritiheavenscrolls1", card: "nrss.hr.008" }),
          { cols: 1, rows: 2 },
        ),
      ).toBeNull();
      expect(
        inferKayouLenticularCropProfile(
          entry({ set: "t4w1", card: "nr.hr.003", langs: { en: { artW: 282, artH: 411 } } }),
          { cols: 1, rows: 2 },
        ),
      ).toBeNull();
    });

    it("assigns fixed heaven 2×2 crop profile to smritiheavenscrolls1 HR grids", () => {
      expect(
        inferKayouLenticularCropProfile(
          entry({ set: "smritiheavenscrolls1", card: "nrss.hr.002" }),
          { cols: 2, rows: 2 },
        ),
      ).toBe(KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2);
      expect(
        inferKayouLenticularCropProfile(
          entry({ set: "t4w4", card: "nr.hr.121" }),
          { cols: 2, rows: 2 },
        ),
      ).toBeNull();
    });

    it("assigns fixed heaven 2×3 crop profile to smritiheavenscrolls1 HR grids", () => {
      expect(
        inferKayouLenticularCropProfile(
          entry({ set: "smritiheavenscrolls1", card: "nrss.hr.005" }),
          { cols: 2, rows: 3 },
        ),
      ).toBe(KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3);
      expect(
        inferKayouLenticularCropProfile(
          entry({ set: "t4w4", card: "nr.hr.121" }),
          { cols: 2, rows: 3 },
        ),
      ).toBeNull();
    });

    it("leaves t4w1 single-face HR scans non-lenticular when probed", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");
      const art =
        "data/naruto/kayou/cards/t4w1/en/nr.hr.003/art.narutocards.webp";
      if (!existsSync(art)) return;

      const { data, info } = await sharp(readFileSync(art))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const probe = {
        rgba: new Uint8ClampedArray(data),
        width: info.width,
        height: info.height,
      };
      expect(probeKayouStackedStripGrid(probe.rgba, probe.width, probe.height)).toBeNull();
      expect(
        inferKayouLenticularGrid(entry({ set: "t4w1", card: "nr.hr.003" }), probe),
      ).toBeNull();
      const scanCrop = inferKayouScanCrop(
        entry({ set: "t4w1", card: "nr.hr.003" }),
        probe,
      );
      expect(scanCrop).not.toBeNull();
    });

    it("infers t4w1 Sasuke & Naruto (nr.hr.010) as 1×2 at smaller CDN scale", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");
      const art =
        "data/naruto/kayou/cards/t4w1/en/nr.hr.010/art.narutocards.webp";
      if (!existsSync(art)) return;

      const { data, info } = await sharp(readFileSync(art))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const probe = {
        rgba: new Uint8ClampedArray(data),
        width: info.width,
        height: info.height,
      };
      expect(kayouScanIsLenticularStrip(probe.width, probe.height)).toBe(false);
      expect(probeKayouStackedStripGrid(probe.rgba, probe.width, probe.height)).toEqual({
        cols: 1,
        rows: 2,
      });
      expect(
        inferKayouLenticularGrid(
          entry({
            set: "t4w1",
            card: "nr.hr.010",
            langs: { en: { artW: probe.width, artH: probe.height } },
          }),
          probe,
        ),
      ).toEqual({ cols: 1, rows: 2 });
    });

    it("leaves t4w1 Hinata (nr.hr.040) non-lenticular when probed", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");
      const art = "data/naruto/kayou/cards/t4w1/en/nr.hr.040/art.narutocards.webp";
      if (!existsSync(art)) return;

      const { data, info } = await sharp(readFileSync(art))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const probe = {
        rgba: new Uint8ClampedArray(data),
        width: info.width,
        height: info.height,
      };
      expect(probeKayouStackedStripGrid(probe.rgba, probe.width, probe.height)).toBeNull();
      expect(
        inferKayouLenticularGrid(entry({ set: "t4w1", card: "nr.hr.040" }), probe),
      ).toBeNull();
    });

    it("infers New Year Jiraiya as 1×2 lenticular from a pale mid-row gutter", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");
      const art =
        "data/naruto/kayou/cards/newyeargiftbox/en/nrss.hr.011/art.narutocards.webp";
      if (!existsSync(art)) return;

      const { data, info } = await sharp(readFileSync(art))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const probe = {
        rgba: new Uint8ClampedArray(data),
        width: info.width,
        height: info.height,
      };
      expect(
        inferKayouLenticularGrid(
          entry({ set: "newyeargiftbox", card: "nrss.hr.011" }),
          probe,
        ),
      ).toEqual({ cols: 1, rows: 2 });
      expect(
        inferKayouScanCrop(
          entry({ set: "newyeargiftbox", card: "nrss.hr.011" }),
          probe,
        ),
      ).toBeNull();
    });

    it("infers New Year Neji and Sasuke as 1×2 from narrow pure-white gutters", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");

      for (const card of ["nrss.hr.017", "nrss.hr.018"] as const) {
        const art =
          `data/naruto/kayou/cards/newyeargiftbox/en/${card}/art.narutocards.webp`;
        if (!existsSync(art)) continue;

        const { data, info } = await sharp(readFileSync(art))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const probe = {
          rgba: new Uint8ClampedArray(data),
          width: info.width,
          height: info.height,
        };
        expect(
          inferKayouLenticularGrid(
            entry({ set: "newyeargiftbox", card }),
            probe,
          ),
        ).toEqual({ cols: 1, rows: 2 });
      }
    });

    it("skips rotated landscape HR scans", () => {
      expect(
        inferKayouLenticularGrid(
          entry({
            set: "ninjaagebox",
            card: "nrz08.hr.001",
            langs: { en: { artW: 186, artH: 264 } },
          }),
        ),
      ).toBeNull();
    });
  });
}

// —— lenticularSeamProbe ——
{
  function stripRgba(
    width: number,
    height: number,
    panels: Array<{ y0: number; y1: number }>,
  ): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
    const paint = (y0: number, y1: number) => {
      for (let y = y0; y < y1; y += 1) {
        for (let x = 16; x < width - 16; x += 1) {
          const i = (y * width + x) * 4;
          rgba[i] = 40;
          rgba[i + 1] = 40;
          rgba[i + 2] = 40;
          rgba[i + 3] = 255;
        }
      }
    };
    for (const panel of panels) paint(panel.y0, panel.y1);
    return rgba;
  }

  describe("lenticularSeamProbe", () => {
    it("detects a white seam between two stacked panels", () => {
      const w = 320;
      const h = 450;
      const rgba = stripRgba(w, h, [
        { y0: 16, y1: 215 },
        { y0: 235, y1: 434 },
      ]);
      expect(kayouRowSeamWhiteFraction(rgba, w, h, h / 2)).toBeGreaterThan(0.9);
      expect(probeKayouStackedStripGrid(rgba, w, h)).toEqual({ cols: 1, rows: 2 });
    });

    it("returns null for one continuous portrait face", () => {
      const w = 320;
      const h = 450;
      const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          rgba[i] = 40;
          rgba[i + 1] = 40;
          rgba[i + 2] = 40;
          rgba[i + 3] = 255;
        }
      }
      expect(kayouRowSeamWhiteFraction(rgba, w, h, h / 2)).toBeLessThan(0.05);
      expect(probeKayouStackedStripGrid(rgba, w, h)).toBeNull();
    });

    it("detects three stacked panels from two seam gutters", () => {
      const w = 320;
      const h = 450;
      const rgba = stripRgba(w, h, [
        { y0: 16, y1: 134 },
        { y0: 154, y1: 296 },
        { y0: 316, y1: 434 },
      ]);
      expect(probeKayouStackedStripGrid(rgba, w, h)).toEqual({ cols: 1, rows: 3 });
    });

    it("classifies real t4w1 Isobu as single-face and t4w4 strip as 1×2", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");

      async function load(path: string) {
        const { data, info } = await sharp(readFileSync(path))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        return {
          rgba: new Uint8ClampedArray(data),
          width: info.width,
          height: info.height,
        };
      }

      const isobu =
        "data/naruto/kayou/cards/t4w1/en/nr.hr.003/art.narutocards.webp";
      const dual = "data/naruto/kayou/cards/t4w4/en/nr.hr.121/art.narutocards.webp";
      if (!existsSync(isobu) || !existsSync(dual)) return;

      const iso = await load(isobu);
      const strip = await load(dual);
      expect(probeKayouStackedStripGrid(iso.rgba, iso.width, iso.height)).toBeNull();
      expect(probeKayouStackedStripGrid(strip.rgba, strip.width, strip.height)).toEqual({
        cols: 1,
        rows: 2,
      });
    });

    it("does not treat t4w1 Hinata (nr.hr.040) as lenticular", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");
      const art = "data/naruto/kayou/cards/t4w1/en/nr.hr.040/art.narutocards.webp";
      if (!existsSync(art)) return;

      const { data, info } = await sharp(readFileSync(art))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(
        probeKayouStackedStripGrid(
          new Uint8ClampedArray(data),
          info.width,
          info.height,
        ),
      ).toBeNull();
    });

    it("detects pale mid-row gutters on New Year Jiraiya (nrss.hr.011)", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");
      const art =
        "data/naruto/kayou/cards/newyeargiftbox/en/nrss.hr.011/art.narutocards.webp";
      if (!existsSync(art)) return;

      const { data, info } = await sharp(readFileSync(art))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(
        probeKayouStackedStripGrid(
          new Uint8ClampedArray(data),
          info.width,
          info.height,
        ),
      ).toEqual({ cols: 1, rows: 2 });
    });

    it("detects New Year Neji and Sasuke strips (nrss.hr.017–018)", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");

      async function load(card: string) {
        const path =
          `data/naruto/kayou/cards/newyeargiftbox/en/${card}/art.narutocards.webp`;
        if (!existsSync(path)) return null;
        const { data, info } = await sharp(readFileSync(path))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        return {
          rgba: new Uint8ClampedArray(data),
          width: info.width,
          height: info.height,
        };
      }

      for (const card of ["nrss.hr.017", "nrss.hr.018"] as const) {
        const art = await load(card);
        if (!art) continue;
        expect(
          probeKayouStackedStripGrid(art.rgba, art.width, art.height),
        ).toEqual({ cols: 1, rows: 2 });
      }
    });

    it("detects t4w5 Team 7 (nr.hr.163) as 1×2", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");
      const art = "data/naruto/kayou/cards/t4w5/en/nr.hr.163/art.narutocards.webp";
      if (!existsSync(art)) return;

      const { data, info } = await sharp(readFileSync(art))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(
        probeKayouStackedStripGrid(
          new Uint8ClampedArray(data),
          info.width,
          info.height,
        ),
      ).toEqual({ cols: 1, rows: 2 });
    });
  });
}

// —— landscapePrints ——
{
  describe("kayouNameLooksLikeStoryPanel", () => {
    it.each([
      ["My Name Is Konohamaru! 1", true],
      ["A New Chapter Begins: The Chunin Exam! 5", true],
      ["R-111", true],
      ["SR-024", true],
      ["Naruto Uzumaki", false],
      ["PR-059", false],
    ])("%s → %s", (name, want) => {
      expect(kayouNameLooksLikeStoryPanel(name)).toBe(want);
    });
  });

  describe("kayouCardNumberIsCompactPivotRarity", () => {
    it.each([
      ["nrz08.hr.001", true],
      ["nrz08.mr.003", true],
      ["nrz07.pr.060", true],
      ["nrz08.r.001", false],
      ["nr.hr.121", true],
      ["nr.ss.hr.011", true],
      ["nr.ss.hr.020", true],
      ["nrss.hr.011", true],
    ])("%s → %s", (card, want) => {
      expect(kayouCardNumberIsCompactPivotRarity(card)).toBe(want);
    });
  });

  describe("kayouCardNumberIsHrOrMr", () => {
    it.each([
      ["nrz08.hr.001", true],
      ["nrz08.mr.003", true],
      ["nrz08.r.001", false],
      ["nr.hr.121", true],
    ])("%s → %s", (card, want) => {
      expect(kayouCardNumberIsHrOrMr(card)).toBe(want);
    });
  });

  describe("kayouCardNumberIsCcSeries", () => {
    it.each([
      ["cc.r.001", true],
      ["cc.mr.001", true],
      ["cc.ur.022", true],
      ["nr.cc.r.001", true],
      ["nr.cc.mr.001s", true],
      ["nr.hr.121", false],
      ["nrz08.hr.001", false],
    ])("%s → %s", (card, want) => {
      expect(kayouCardNumberIsCcSeries(card)).toBe(want);
    });
  });

  describe("kayouCardNumberIsCcRotatedLandscapeWave", () => {
    it.each([
      ["cc.r.001", true],
      ["cc.sr.024", true],
      ["cc.mr.001", false],
      ["cc.mr.005", false],
      ["nr.cc.r.001", true],
      ["nr.cc.sr.024", true],
      ["nr.cc.mr.001s", true],
      ["cc.mr.001s", true],
      ["cc.ptr.001", false],
      ["cc.qr.001", false],
      ["cc.sp.001", false],
      ["cc.ssr.001", false],
      ["cc.ur.001", false],
      ["nr.hr.121", false],
    ])("%s → %s", (card, want) => {
      expect(kayouCardNumberIsCcRotatedLandscapeWave(card)).toBe(want);
    });
  });

  describe("kayouScanIsRotatedLandscape", () => {
    it("flags NRZ08-style compact portrait HR scans", () => {
      expect(kayouScanIsRotatedLandscape(186, 264, "HR")).toBe(true);
      expect(kayouScanIsRotatedLandscape(188, 264, "HR")).toBe(true);
      expect(kayouScanIsRotatedLandscape(235, 320, "HR")).toBe(true);
    });

    it("keeps lenticular strips portrait", () => {
      expect(kayouScanIsRotatedLandscape(320, 450, "HR")).toBe(false);
      expect(kayouScanIsRotatedLandscape(768, 1076, "HR")).toBe(false);
    });

    it("flags New Year gift box nr.ss.hr compact landscape pivots", () => {
      expect(
        kayouScanIsRotatedLandscape(257, 361, "SS-HR", "nr.ss.hr.011"),
      ).toBe(true);
      expect(
        kayouScanIsRotatedLandscape(257, 361, "HR", "nr.ss.hr.020"),
      ).toBe(true);
    });

    it("keeps t4w6 MR portrait waves upright (not NRZ08-style pivot)", () => {
      expect(kayouScanIsRotatedLandscape(280, 396, "MR")).toBe(false);
      expect(kayouScanIsRotatedLandscape(281, 393, "MR")).toBe(false);
    });

    it("keeps t2w7 nrb07 character MRs portrait (~268×378 CapsuleCorp)", () => {
      expect(
        kayouScanIsRotatedLandscape(268, 378, "MR", "nrb07.mr.069", "Naruto Uzumaki"),
      ).toBe(false);
      expect(
        kayouScanIsRotatedLandscape(268, 377, "MR", "nrb07.mr.072", "Kakashi Hatake"),
      ).toBe(false);
    });

    it("still flags NRZ08 compact MR pivots as rotated landscape", () => {
      expect(kayouScanIsRotatedLandscape(186, 264, "MR", "nrz08.mr.003")).toBe(true);
    });

    it("flags Ninja Age cc.r / cc.sr / wedding mr.*s as rotated landscape", () => {
      expect(kayouScanIsRotatedLandscape(257, 357, "R", "cc.r.001")).toBe(true);
      expect(kayouScanIsRotatedLandscape(257, 362, "SR", "cc.sr.024")).toBe(true);
      expect(
        kayouScanIsRotatedLandscape(257, 357, "CC-R", "nr.cc.r.001"),
      ).toBe(true);
      expect(
        kayouScanIsRotatedLandscape(257, 366, "CC-SR", "nr.cc.sr.001"),
      ).toBe(true);
      expect(
        kayouScanIsRotatedLandscape(257, 361, "CC-MR", "nr.cc.mr.001s"),
      ).toBe(true);
    });

    it("keeps Ninja Age character cc.mr.001–005 portrait", () => {
      expect(kayouScanIsRotatedLandscape(257, 361, "MR", "cc.mr.001")).toBe(false);
      expect(kayouScanIsRotatedLandscape(257, 360, "MR", "cc.mr.002")).toBe(false);
      expect(kayouScanIsRotatedLandscape(257, 361, "MR", "cc.mr.005")).toBe(false);
    });

    it("keeps other Ninja Age cc tiers portrait despite shared scan size", () => {
      expect(kayouScanIsRotatedLandscape(257, 363, "PTR", "cc.ptr.001")).toBe(false);
      expect(kayouScanIsRotatedLandscape(257, 361, "QR", "cc.qr.001")).toBe(false);
      expect(kayouScanIsRotatedLandscape(257, 363, "SP", "cc.sp.001")).toBe(false);
      expect(kayouScanIsRotatedLandscape(257, 362, "SSR", "cc.ssr.001")).toBe(false);
      expect(kayouScanIsRotatedLandscape(257, 361, "UR", "cc.ur.001")).toBe(false);
    });

    it("auto-manages all cc.* index flags so stale cc.ptr/qr marks clear", () => {
      expect(
        kayouEntryUsesRotatedLandscapeHeuristic({ card: "cc.mr.001", rarity: "MR" }),
      ).toBe(true);
      expect(
        kayouEntryUsesRotatedLandscapeHeuristic({ card: "nr.cc.r.001", rarity: "CC-R" }),
      ).toBe(true);
      expect(
        kayouEntryUsesRotatedLandscapeHeuristic({ card: "cc.ptr.001", rarity: "PTR" }),
      ).toBe(true);
      expect(
        kayouEntryUsesRotatedLandscapeHeuristic({ card: "cc.r.001", rarity: "R" }),
      ).toBe(true);
    });

    it("flags t4w6 CapsuleCorp R-NNN stub story panels as rotated landscape", () => {
      expect(
        kayouScanIsRotatedLandscape(257, 363, "R", "nr.r.111", "R-111"),
      ).toBe(true);
      expect(
        kayouScanIsRotatedLandscape(257, 363, "R", "nr.r.160", "R-160"),
      ).toBe(true);
    });

    it("flags t2w7 story R panels (chapter titles) as rotated landscape", () => {
      expect(
        kayouScanIsRotatedLandscape(
          400,
          568,
          "R",
          "nr.r.161",
          "My Name Is Konohamaru! 1",
        ),
      ).toBe(true);
      expect(
        kayouScanIsRotatedLandscape(
          400,
          568,
          "R",
          "nr.r.210",
          "A New Chapter Begins: The Chunin Exam! 5",
        ),
      ).toBe(true);
    });

    it("keeps character R cards portrait despite CDN scan size", () => {
      expect(
        kayouScanIsRotatedLandscape(400, 564, "R", "nr.r.001", "Naruto Uzumaki"),
      ).toBe(false);
    });

    it("flags t4w7 PR-060 compact pivot scan as rotated landscape", () => {
      expect(kayouScanIsRotatedLandscape(216, 304, "PR", "nrz07.pr.060")).toBe(true);
    });

    it("flags attested CDN catalogue promo pivots as rotated landscape", () => {
      expect(kayouScanIsRotatedLandscape(400, 562, "PR", "nr.pr.058")).toBe(true);
      expect(kayouScanIsRotatedLandscape(400, 568, "PR", "nr.pr.060")).toBe(true);
      expect(kayouScanIsRotatedLandscape(400, 562, "PR", "nr.pr.070")).toBe(true);
    });

    it("keeps other catalogue nr.pr.* promos portrait (compact + CDN)", () => {
      expect(kayouScanIsRotatedLandscape(257, 361, "PR", "nr.pr.001")).toBe(false);
      expect(kayouScanIsRotatedLandscape(257, 361, "PR", "nr.pr.046")).toBe(false);
      expect(kayouScanIsRotatedLandscape(400, 564, "PR", "nr.pr.055")).toBe(false);
      expect(kayouScanIsRotatedLandscape(400, 564, "PR", "nr.pr.059")).toBe(false);
      expect(kayouScanIsRotatedLandscape(400, 561, "PR", "nr.pr.071")).toBe(false);
    });

    it("auto-clears stale nr.pr.* landscape flags", () => {
      expect(
        kayouEntryUsesRotatedLandscapeHeuristic({ card: "nr.pr.001", rarity: "PR" }),
      ).toBe(true);
    });

    it("ignores non HR/MR/PR and already-landscape scans", () => {
      expect(kayouScanIsRotatedLandscape(186, 264, "R")).toBe(false);
      expect(kayouScanIsRotatedLandscape(450, 320, "HR")).toBe(false);
    });
  });
}
