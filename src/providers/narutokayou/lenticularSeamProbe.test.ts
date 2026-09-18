import { describe, expect, it } from "vitest";

import {
  kayouRowSeamWhiteFraction,
  probeKayouStackedStripGrid,
} from "./lenticularSeamProbe";

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
