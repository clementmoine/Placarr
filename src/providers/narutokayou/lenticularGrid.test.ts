import { describe, expect, it } from "vitest";

import type { CardsIndexEntry } from "@/effects/cardsIndex";

import {
  inferKayouLenticularCropProfile,
  inferKayouLenticularGrid,
  inferKayouScanCrop,
  KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE,
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2,
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3,
  kayouScanIsLenticularStrip,
} from "./lenticularGrid";
import { probeKayouStackedStripGrid } from "./lenticularSeamProbe";

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
