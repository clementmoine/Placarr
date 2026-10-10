import { describe, expect, it } from "vitest";

import { leanFromPointer } from "@/core/render/deviceTilt";
import { idleLeanFromSeconds } from "@/core/render/foil/idleLean";

import {
  KAYOU_LENTICULAR_PANEL_CROPS,
  detectLenticularPanelCropsFromRgba,
  detectLenticularStripLayoutFromRgba,
  detectStackedStripRowBounds,
  KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE,
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2,
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3,
  KAYOU_LENTICULAR_FIXED_PANEL_CROPS,
  resolveLenticularStripLayoutFromRgba,
  lenticularArtAspectRatio,
  lenticularArtStyle,
  lenticularBackgroundPosition,
  lenticularPanelCrop,
  lenticularPanelIndex,
  lenticularPanelIsLandscape,
  lenticularIdleNorm,
  lenticularNormFromIdleLean,
  lenticularNormFromLean,
  lenticularPairImgLayouts,
  lenticularPanelImgLayout,
  lenticularPointerNorm,
  lenticularStripAxis,
  lenticularViewportContentSize,
  resolveLenticularStripPair,
  resolveLenticularStripQuad,
  type LenticularGrid,
  type LenticularPanelCrop,
} from "./kayouLenticularArt";

const HEAVEN_SCROLL_HR = "data/naruto/kayou/cards/smritiheavenscrolls1/en";

function rgbaLuminance(
  rgba: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
): number {
  const i = (y * width + x) * 4;
  return (rgba[i]! + rgba[i + 1]! + rgba[i + 2]!) / 3;
}

/** Max white-pixel fraction along left/right cropped edges (regression guard). */
function maxLateralWhiteEdgeFraction(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  grid: LenticularGrid,
  crops: ReadonlyArray<LenticularPanelCrop>,
  lumThreshold = 235,
): number {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const panelW = width / cols;
  const panelH = height / rows;
  let worst = 0;

  for (let i = 0; i < crops.length; i += 1) {
    const crop = crops[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = Math.floor(col * panelW) + crop.left;
    const x1 = Math.floor((col + 1) * panelW) - crop.right;
    const y0 = Math.floor(row * panelH) + crop.top;
    const y1 = Math.floor((row + 1) * panelH) - crop.bottom;
    const boxH = Math.max(1, y1 - y0);

    let left = 0;
    for (let y = y0; y < y1; y += 1) {
      if (rgbaLuminance(rgba, x0, y, width) >= lumThreshold) left += 1;
    }
    let right = 0;
    for (let y = y0; y < y1; y += 1) {
      if (rgbaLuminance(rgba, x1 - 1, y, width) >= lumThreshold) right += 1;
    }
    worst = Math.max(worst, left / boxH, right / boxH);
  }

  return worst;
}

/** Max white-pixel fraction on any cropped edge for one panel. */
function maxPanelEdgeWhiteFraction(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  grid: LenticularGrid,
  crops: ReadonlyArray<LenticularPanelCrop>,
  panelIndex: number,
  lumThreshold = 235,
): number {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const panelW = width / cols;
  const crop = crops[panelIndex];
  if (!crop) return 1;
  const col = panelIndex % cols;
  const row = Math.floor(panelIndex / cols);
  const rowBounds = detectStackedStripRowBounds(rgba, width, height, grid);
  const yPanel0 =
    rowBounds && rowBounds.length === rows + 1
      ? rowBounds[row]!
      : Math.floor(row * (height / rows));
  const yPanel1 =
    rowBounds && rowBounds.length === rows + 1
      ? rowBounds[row + 1]!
      : Math.floor((row + 1) * (height / rows));
  const x0 = Math.floor(col * panelW) + crop.left;
  const x1 = Math.floor((col + 1) * panelW) - crop.right;
  const y0 = yPanel0 + crop.top;
  const y1 = yPanel1 - crop.bottom;
  const boxW = Math.max(1, x1 - x0);
  const boxH = Math.max(1, y1 - y0);

  let top = 0;
  for (let x = x0; x < x1; x += 1) {
    if (rgbaLuminance(rgba, x, y0, width) >= lumThreshold) top += 1;
  }
  let bottom = 0;
  for (let x = x0; x < x1; x += 1) {
    if (rgbaLuminance(rgba, x, y1 - 1, width) >= lumThreshold) bottom += 1;
  }
  let left = 0;
  for (let y = y0; y < y1; y += 1) {
    if (rgbaLuminance(rgba, x0, y, width) >= lumThreshold) left += 1;
  }
  let right = 0;
  for (let y = y0; y < y1; y += 1) {
    if (rgbaLuminance(rgba, x1 - 1, y, width) >= lumThreshold) right += 1;
  }
  return Math.max(left / boxH, right / boxH, top / boxW, bottom / boxW);
}

function panelEdgeWhite(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  grid: LenticularGrid,
  crops: ReadonlyArray<LenticularPanelCrop>,
  panelIndex: number,
  edge: "left" | "right" | "top" | "bottom",
  lumThreshold = 235,
): number {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const panelW = width / cols;
  const crop = crops[panelIndex];
  if (!crop) return 1;
  const col = panelIndex % cols;
  const row = Math.floor(panelIndex / cols);
  const rowBounds = detectStackedStripRowBounds(rgba, width, height, grid);
  const yPanel0 =
    rowBounds && rowBounds.length === rows + 1
      ? rowBounds[row]!
      : Math.floor(row * (height / rows));
  const yPanel1 =
    rowBounds && rowBounds.length === rows + 1
      ? rowBounds[row + 1]!
      : Math.floor((row + 1) * (height / rows));
  const x0 = Math.floor(col * panelW) + crop.left;
  const x1 = Math.floor((col + 1) * panelW) - crop.right;
  const y0 = yPanel0 + crop.top;
  const y1 = yPanel1 - crop.bottom;
  const boxW = Math.max(1, x1 - x0);
  const boxH = Math.max(1, y1 - y0);
  if (edge === "left") {
    let white = 0;
    for (let y = y0; y < y1; y += 1) {
      if (rgbaLuminance(rgba, x0, y, width) >= lumThreshold) white += 1;
    }
    return white / boxH;
  }
  if (edge === "right") {
    let white = 0;
    for (let y = y0; y < y1; y += 1) {
      if (rgbaLuminance(rgba, x1 - 1, y, width) >= lumThreshold) white += 1;
    }
    return white / boxH;
  }
  if (edge === "top") {
    let white = 0;
    for (let x = x0; x < x1; x += 1) {
      if (rgbaLuminance(rgba, x, y0, width) >= lumThreshold) white += 1;
    }
    return white / boxW;
  }
  let white = 0;
  for (let x = x0; x < x1; x += 1) {
    if (rgbaLuminance(rgba, x, y1 - 1, width) >= lumThreshold) white += 1;
  }
  return white / boxW;
}

async function loadHeavenScrollRgba(path: string) {
  const sharp = (await import("sharp")).default;
  const { readFileSync } = await import("node:fs");
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

describe("kayouLenticularArt", () => {
  const grid2x2 = { cols: 2, rows: 2 };

  it("maps pointer X across four panels", () => {
    expect(lenticularPanelIndex(0, grid2x2)).toBe(0);
    expect(lenticularPanelIndex(24, grid2x2)).toBe(0);
    expect(lenticularPanelIndex(25, grid2x2)).toBe(1);
    expect(lenticularPanelIndex(50, grid2x2)).toBe(2);
    expect(lenticularPanelIndex(99, grid2x2)).toBe(3);
  });

  it("positions each quadrant of a 2×2 sheet", () => {
    expect(lenticularBackgroundPosition(0, grid2x2)).toEqual({ x: 0, y: 0 });
    expect(lenticularBackgroundPosition(1, grid2x2)).toEqual({ x: 100, y: 0 });
    expect(lenticularBackgroundPosition(2, grid2x2)).toEqual({ x: 0, y: 100 });
    expect(lenticularBackgroundPosition(3, grid2x2)).toEqual({
      x: 100,
      y: 100,
    });
  });

  it("uses cropped panel aspect for Heaven Scroll 320×450 strips", () => {
    expect(lenticularArtAspectRatio(320, 450, grid2x2)).toBe("142 / 101");
  });

  it("uses the shared viewport for stacked 1×N strips", () => {
    const grid1x2 = { cols: 1, rows: 2 };
    expect(lenticularArtAspectRatio(320, 450, grid1x2)).toBe("280 / 193");
    expect(lenticularPanelIsLandscape(320, 450, grid1x2)).toBe(true);
    expect(lenticularIdleNorm(grid1x2)).toEqual({ x: 0.5, y: 0 });
    const grid1x3 = { cols: 1, rows: 3 };
    expect(lenticularArtAspectRatio(320, 450, grid1x3)).toBe("180 / 120");
  });

  it("lists attested crop patterns for each Heaven Scroll grid", () => {
    expect(Object.keys(KAYOU_LENTICULAR_PANEL_CROPS).sort()).toEqual([
      "1x2",
      "1x3",
      "2x2",
      "2x3",
    ]);
    expect(lenticularPanelCrop({ cols: 1, rows: 2 })).toEqual({
      left: 20,
      top: 20,
      right: 20,
      bottom: 12,
    });
  });

  it("pairs columns within the row selected by Y on a 2×2 sheet", () => {
    expect(resolveLenticularStripPair(grid2x2, 0.2, 0.1)).toEqual({
      panelA: 0,
      panelB: 1,
      blend: 0.2,
      scrubAxis: "x",
    });
    expect(resolveLenticularStripPair(grid2x2, 0.8, 0.1)).toEqual({
      panelA: 0,
      panelB: 1,
      blend: 0.8,
      scrubAxis: "x",
    });
    expect(resolveLenticularStripPair(grid2x2, 1, 0.1)).toEqual({
      panelA: 1,
      panelB: 3,
      blend: 0.1,
      scrubAxis: "y",
    });
  });

  it("scrubs rows within a column when Y dominates on 2×2", () => {
    expect(resolveLenticularStripPair(grid2x2, 0.1, 0.25)).toEqual({
      panelA: 0,
      panelB: 2,
      blend: 0.25,
      scrubAxis: "y",
    });
    expect(resolveLenticularStripPair(grid2x2, 0.25, 0.9)).toEqual({
      panelA: 0,
      panelB: 2,
      blend: 0.9,
      scrubAxis: "y",
    });
    expect(resolveLenticularStripPair(grid2x2, 0.8, 0.9)).toEqual({
      panelA: 1,
      panelB: 3,
      blend: 0.9,
      scrubAxis: "y",
    });
    expect(lenticularStripAxis(grid2x2, "y")).toBe("horizontal");
    expect(lenticularStripAxis(grid2x2, "x")).toBe("vertical");
  });

  it("keeps one vertical pair while scrubbing Y on 2×2 (no row snap)", () => {
    const x = 0.1;
    const ys = [0.15, 0.25, 0.5, 0.75, 0.95];
    const pairs = ys.map((y) => resolveLenticularStripPair(grid2x2, x, y));
    for (const pair of pairs) {
      expect(pair).toMatchObject({ panelA: 0, panelB: 2, scrubAxis: "y" });
    }
    const blends = pairs.map((p) => p.blend);
    for (let i = 1; i < blends.length; i += 1) {
      expect(blends[i]).toBeGreaterThan(blends[i - 1]!);
    }
  });

  it("scrubs both axes on a 2×3 sheet (hr-3x2)", () => {
    const grid2x3 = { cols: 2, rows: 3 };
    expect(resolveLenticularStripPair(grid2x3, 0.6, 0.1)).toEqual({
      panelA: 0,
      panelB: 1,
      blend: 0.6,
      scrubAxis: "x",
    });
    expect(resolveLenticularStripPair(grid2x3, 0.1, 0.25)).toEqual({
      panelA: 0,
      panelB: 2,
      blend: 0.5,
      scrubAxis: "y",
    });
    expect(resolveLenticularStripPair(grid2x3, 0.25, 0.9)).toEqual({
      panelA: 2,
      panelB: 4,
      blend: 0.8,
      scrubAxis: "y",
    });
    expect(resolveLenticularStripPair(grid2x3, 0.9, 0.95)).toEqual({
      panelA: 4,
      panelB: 5,
      blend: 0.9,
      scrubAxis: "x",
    });
  });

  it("interpolates all four 2×2 corners on a diagonal scrub", () => {
    expect(resolveLenticularStripQuad(grid2x2, 0.5, 0.5)).toEqual({
      tl: 0,
      tr: 1,
      bl: 2,
      br: 3,
      blendX: 0.5,
      blendY: 0.5,
    });
    expect(resolveLenticularStripQuad(grid2x2, 0.25, 0.75)).toEqual({
      tl: 0,
      tr: 1,
      bl: 2,
      br: 3,
      blendX: 0.25,
      blendY: 0.75,
    });
    expect(resolveLenticularStripQuad(grid2x2, 0, 0)).toEqual({
      tl: 0,
      tr: 1,
      bl: 2,
      br: 3,
      blendX: 0,
      blendY: 0,
    });
    expect(resolveLenticularStripQuad(grid2x2, 1, 1)).toEqual({
      tl: 3,
      tr: 3,
      bl: 3,
      br: 3,
      blendX: 0,
      blendY: 0,
    });
  });

  it("maps idle lean across the full face flip on 1×2", () => {
    const grid1x2 = { cols: 1, rows: 2 };
    const top = lenticularNormFromIdleLean(
      grid1x2,
      idleLeanFromSeconds(0, 18),
    );
    const bottom = lenticularNormFromIdleLean(
      grid1x2,
      idleLeanFromSeconds(Math.PI, 18),
    );
    expect(top.y).toBeCloseTo(0, 2);
    expect(bottom.y).toBeCloseTo(1, 2);
    expect(lenticularNormFromLean(grid1x2, 50, 28).y).toBeLessThan(0.3);
  });

  it("maps foil light coordinates to scrub axes", () => {
    const grid1x2 = { cols: 1, rows: 2 };
    const low = lenticularNormFromLean(grid1x2, 50, 28);
    const high = lenticularNormFromLean(grid1x2, 50, 72);
    expect(low.x).toBe(0.5);
    expect(high.x).toBe(0.5);
    expect(high.y).toBeGreaterThan(low.y);
  });

  it("flips stacked rows on a 1×2 strip with vertical pointer (hr-2x1)", () => {
    const grid1x2 = { cols: 1, rows: 2 };
    expect(lenticularStripAxis(grid1x2)).toBe("horizontal");
    expect(lenticularPointerNorm(grid1x2, 0, 0.25)).toEqual({ x: 0.5, y: expect.any(Number) });
    expect(lenticularPointerNorm(grid1x2, 0.9, 0.25).x).toBe(0.5);
    expect(resolveLenticularStripPair(grid1x2, 0.5, 0)).toEqual({
      panelA: 0,
      panelB: 1,
      blend: 0,
      scrubAxis: "y",
    });
    expect(resolveLenticularStripPair(grid1x2, 0.5, 0.25)).toEqual({
      panelA: 0,
      panelB: 1,
      blend: 0.25,
      scrubAxis: "y",
    });
    expect(resolveLenticularStripPair(grid1x2, 0.5, 0.5)).toEqual({
      panelA: 0,
      panelB: 1,
      blend: 0.5,
      scrubAxis: "y",
    });
    expect(resolveLenticularStripPair(grid1x2, 0.5, 1)).toEqual({
      panelA: 1,
      panelB: 1,
      blend: 1,
      scrubAxis: "y",
    });
  });

  it("detects per-panel gutters on a synthetic 1×2 strip", () => {
    const w = 320;
    const h = 450;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
    const paint = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          rgba[i] = 40;
          rgba[i + 1] = 40;
          rgba[i + 2] = 40;
          rgba[i + 3] = 255;
        }
      }
    };
    paint(16, 16, 304, 225);
    paint(16, 225, 304, 432);
    const crops = detectLenticularPanelCropsFromRgba(rgba, w, h, {
      cols: 1,
      rows: 2,
    });
    expect(crops[0]).toEqual({ left: 16, top: 16, right: 16, bottom: 0 });
    expect(crops[1]).toEqual({ left: 16, top: 0, right: 16, bottom: 18 });
  });

  it("detects asymmetric row gutters on Heaven Scroll hr-2x2 scan", async () => {
    const { rgba, width, height } = await loadHeavenScrollRgba(
      `${HEAVEN_SCROLL_HR}/nrss.hr.002/art.narutocards.webp`,
    );
    const crops = detectLenticularPanelCropsFromRgba(rgba, width, height, {
      cols: 2,
      rows: 2,
    });
    expect(crops[0]?.top).toBeGreaterThan(100);
    expect(crops[2]?.bottom).toBeGreaterThan(100);
    expect(crops[0]?.left).toBeGreaterThan(15);
  });

  it("covers a landscape playroom box on hr-2x2 horizontal pairs", async () => {
    const { rgba, width, height } = await loadHeavenScrollRgba(
      `${HEAVEN_SCROLL_HR}/nrss.hr.002/art.narutocards.webp`,
    );
    const grid = { cols: 2, rows: 2 };
    const profile = KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2;
    const { crops } = resolveLenticularStripLayoutFromRgba(
      rgba,
      width,
      height,
      grid,
      undefined,
      { cropProfile: profile },
    );
    const boxW = 374;
    const boxH = 252;
    const panelW = width / grid.cols;
    const pair = lenticularPairImgLayouts(
      { w: width, h: height },
      grid,
      0,
      1,
      boxW,
      boxH,
      crops,
    )!;
    const contentRight = (panelIndex: number, layout: { left: number }) => {
      const crop = crops[panelIndex]!;
      const col = panelIndex % grid.cols;
      return (
        layout.left +
        (col * panelW + crop.left + (panelW - crop.left - crop.right)) *
          pair.scale
      );
    };
    expect(contentRight(0, pair.a)).toBeGreaterThanOrEqual(boxW - 1);
    expect(contentRight(1, pair.b)).toBeGreaterThanOrEqual(boxW - 1);
  });

  it("covers portrait playroom box height on hr-2x2 horizontal pairs", async () => {
    const { rgba, width, height } = await loadHeavenScrollRgba(
      `${HEAVEN_SCROLL_HR}/nrss.hr.002/art.narutocards.webp`,
    );
    const grid = { cols: 2, rows: 2 };
    const profile = KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2;
    const { crops } = resolveLenticularStripLayoutFromRgba(
      rgba,
      width,
      height,
      grid,
      undefined,
      { cropProfile: profile },
    );
    const boxW = 260;
    const boxH = 364;
    const pair = lenticularPairImgLayouts(
      { w: width, h: height },
      grid,
      0,
      1,
      boxW,
      boxH,
      crops,
    )!;
    const viewport = lenticularViewportContentSize(width, height, grid, crops);
    expect(viewport.h * pair.scale).toBeGreaterThanOrEqual(boxH - 1);
    expect(viewport.w * pair.scale).toBeGreaterThanOrEqual(boxW - 1);
  });

  it("maps all hr-2x2 panels into a balanced vertical band (row shiftY)", async () => {
    const { rgba, width, height } = await loadHeavenScrollRgba(
      `${HEAVEN_SCROLL_HR}/nrss.hr.002/art.narutocards.webp`,
    );
    const grid = { cols: 2, rows: 2 };
    const profile = KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2;
    const { crops } = resolveLenticularStripLayoutFromRgba(
      rgba,
      width,
      height,
      grid,
      undefined,
      { cropProfile: profile },
    );
    const viewport = lenticularViewportContentSize(width, height, grid, crops);
    const boxW = 374;
    const boxH = 252;
    const scale = Math.max(boxW / viewport.w, boxH / viewport.h);

    const layout0Base = lenticularPanelImgLayout(
      { w: width, h: height },
      grid,
      0,
      boxW,
      boxH,
      crops.map((c) => ({ ...c, shiftY: 0 })),
      scale,
    )!;
    const layout0 = lenticularPanelImgLayout(
      { w: width, h: height },
      grid,
      0,
      boxW,
      boxH,
      crops,
      scale,
    )!;
    const layout2Base = lenticularPanelImgLayout(
      { w: width, h: height },
      grid,
      2,
      boxW,
      boxH,
      crops.map((c) => ({ ...c, shiftY: 0 })),
      scale,
    )!;
    const layout2 = lenticularPanelImgLayout(
      { w: width, h: height },
      grid,
      2,
      boxW,
      boxH,
      crops,
      scale,
    )!;
    expect(layout0.top - layout0Base.top).toBeCloseTo(-20 * scale, 0);
    expect(layout2.top - layout2Base.top).toBeCloseTo(32 * scale, 0);
    expect(crops[0]?.shiftY).toBe(-20);
    expect(crops[0]?.top).toBe(88);
    expect(crops[2]?.shiftY).toBe(32);
    expect(crops[3]?.shiftY).toBe(32);
  });

  describe("Heaven Scroll 1×N crop regression", () => {
    it("golden-master per-panel crops on hr-3x1 (Ichiraku)", async () => {
      const { rgba, width, height } = await loadHeavenScrollRgba(
        `${HEAVEN_SCROLL_HR}/nrss.hr.003/art.narutocards.webp`,
      );
      const grid = { cols: 1, rows: 3 };
      const crops = detectLenticularPanelCropsFromRgba(rgba, width, height, grid);
      expect(crops).toEqual([
        { left: 70, top: 20, right: 70, bottom: 1 },
        { left: 70, top: 11, right: 70, bottom: 11 },
        { left: 70, top: 1, right: 70, bottom: 20 },
      ]);
      expect(
        maxLateralWhiteEdgeFraction(rgba, width, height, grid, crops),
      ).toBeLessThan(0.09);
    });

    it("golden-master per-panel crops on hr-2x1 (Boruto)", async () => {
      const { rgba, width, height } = await loadHeavenScrollRgba(
        `${HEAVEN_SCROLL_HR}/nrss.hr.008/art.narutocards.webp`,
      );
      const grid = { cols: 1, rows: 2 };
      const crops = detectLenticularPanelCropsFromRgba(rgba, width, height, grid);
      expect(crops).toEqual([
        { left: 20, top: 20, right: 20, bottom: 5 },
        { left: 20, top: 5, right: 20, bottom: 20 },
      ]);
      expect(
        maxLateralWhiteEdgeFraction(rgba, width, height, grid, crops),
      ).toBeLessThan(0.08);
    });

    it("trims offset inter-row gutter on New Year Jiraiya (nrss.hr.011)", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");
      const path =
        "data/naruto/kayou/cards/newyeargiftbox/en/nrss.hr.011/art.narutocards.webp";
      if (!existsSync(path)) return;

      const { data, info } = await sharp(readFileSync(path))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const rgba = new Uint8ClampedArray(data);
      const grid = { cols: 1, rows: 2 };
      const crops = detectLenticularPanelCropsFromRgba(
        rgba,
        info.width,
        info.height,
        grid,
      );
      expect(crops).toEqual([
        { left: 31, top: 16, right: 26, bottom: 0 },
        { left: 32, top: 26, right: 28, bottom: 17 },
      ]);
      expect(crops[1]?.top).toBeGreaterThanOrEqual(8);
      expect(
        maxLateralWhiteEdgeFraction(rgba, info.width, info.height, grid, crops),
      ).toBeLessThan(0.08);
    });

    it("uses fixed dual-wave crops for t4w* HR when profile is set", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");
      const grid = { cols: 1, rows: 2 };
      const profile = KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE;
      const cases = [
        "data/naruto/kayou/cards/t4w2/en/nr.hr.057/art.narutocards.webp",
        "data/naruto/kayou/cards/t4w3/en/nr.hr.084/art.narutocards.webp",
        "data/naruto/kayou/cards/t4w4/en/nr.hr.121/art.narutocards.webp",
        "data/naruto/kayou/cards/t4w5/en/nr.hr.162/art.narutocards.webp",
        "data/naruto/kayou/cards/t4w5/en/nr.hr.163/art.narutocards.webp",
      ] as const;

      for (const path of cases) {
        if (!existsSync(path)) continue;
        const { data, info } = await sharp(readFileSync(path))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const rgba = new Uint8ClampedArray(data);
        const auto = detectLenticularStripLayoutFromRgba(
          rgba,
          info.width,
          info.height,
          grid,
        );
        const fixed = resolveLenticularStripLayoutFromRgba(
          rgba,
          info.width,
          info.height,
          grid,
          undefined,
          { cropProfile: profile },
        );
        expect(fixed.crops).toEqual(
          KAYOU_LENTICULAR_FIXED_PANEL_CROPS[profile],
        );
        expect(fixed.rowBounds).toEqual(auto.rowBounds);
        expect(fixed.crops[0]?.left).toBe(20);
        expect(fixed.crops[0]?.right).toBe(20);
        expect(info.width - fixed.crops[0]!.left - fixed.crops[0]!.right).toBe(
          280,
        );
      }
    });

    it("uses fixed heaven 2×2 crops for smritiheavenscrolls1 hr-2x2 (nrss.hr.002)", async () => {
      const { rgba, width, height } = await loadHeavenScrollRgba(
        `${HEAVEN_SCROLL_HR}/nrss.hr.002/art.narutocards.webp`,
      );
      const grid = { cols: 2, rows: 2 };
      const profile = KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2;
      const auto = detectLenticularStripLayoutFromRgba(rgba, width, height, grid);
      const fixed = resolveLenticularStripLayoutFromRgba(
        rgba,
        width,
        height,
        grid,
        undefined,
        { cropProfile: profile },
      );
      expect(fixed.crops).toEqual(KAYOU_LENTICULAR_FIXED_PANEL_CROPS[profile]);
      expect(lenticularViewportContentSize(width, height, grid, fixed.crops)).toEqual({
        w: 134,
        h: 158,
      });
      expect(fixed.crops[0]?.top).toBe(88);
      expect(fixed.crops[0]?.bottom).toBe(10);
      expect(fixed.crops[2]?.top).toBeLessThan(16);
      expect(fixed.crops[0]?.shiftY).toBe(-20);
      expect(fixed.crops[1]?.shiftY).toBe(-20);
      expect(fixed.crops[2]?.shiftY).toBe(32);
      expect(fixed.crops[3]?.shiftY).toBe(32);
    });

    it("uses fixed heaven 2×3 crops for smritiheavenscrolls1 hr-3x2 (nrss.hr.005)", async () => {
      const { rgba, width, height } = await loadHeavenScrollRgba(
        `${HEAVEN_SCROLL_HR}/nrss.hr.005/art.narutocards.webp`,
      );
      const grid = { cols: 2, rows: 3 };
      const profile = KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3;
      const auto = detectLenticularStripLayoutFromRgba(rgba, width, height, grid);
      const fixed = resolveLenticularStripLayoutFromRgba(
        rgba,
        width,
        height,
        grid,
        undefined,
        { cropProfile: profile },
      );
      expect(fixed.crops).toEqual(KAYOU_LENTICULAR_FIXED_PANEL_CROPS[profile]);
      expect(lenticularViewportContentSize(width, height, grid, fixed.crops)).toEqual({
        w: 134,
        h: 142,
      });
      expect(auto.crops[0]?.top).toBeGreaterThan(50);
      expect(fixed.crops[0]?.top).toBe(54);
      expect(fixed.crops[0]?.shiftY).toBe(-17);
      expect(auto.crops[4]?.bottom).toBeGreaterThan(50);
      expect(fixed.crops[4]?.bottom).toBe(52);
      expect(fixed.crops[4]?.top).toBe(8);
      expect(fixed.crops[4]?.shiftY).toBe(22);
      expect(fixed.crops[2]?.top).toBe(4);
      expect(fixed.crops[2]?.shiftY).toBe(1);
      const panelH = height / grid.rows;
      expect(panelH - fixed.crops[0]!.top).toBeGreaterThan(
        panelH - auto.crops[0]!.top,
      );
      expect(panelH - fixed.crops[4]!.bottom).toBeGreaterThan(
        panelH - auto.crops[4]!.bottom,
      );
    });

    it("applies row shiftY on hr-3x2 like hr-2x2", async () => {
      const { rgba, width, height } = await loadHeavenScrollRgba(
        `${HEAVEN_SCROLL_HR}/nrss.hr.005/art.narutocards.webp`,
      );
      const grid = { cols: 2, rows: 3 };
      const { crops } = resolveLenticularStripLayoutFromRgba(
        rgba,
        width,
        height,
        grid,
        undefined,
        { cropProfile: KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3 },
      );
      const boxW = 374;
      const boxH = 252;
      const viewport = lenticularViewportContentSize(width, height, grid, crops);
      const scale = Math.max(boxW / viewport.w, boxH / viewport.h);
      const layout0Base = lenticularPanelImgLayout(
        { w: width, h: height },
        grid,
        0,
        boxW,
        boxH,
        crops.map((c) => ({ ...c, shiftY: 0 })),
        scale,
      )!;
      const layout0 = lenticularPanelImgLayout(
        { w: width, h: height },
        grid,
        0,
        boxW,
        boxH,
        crops,
        scale,
      )!;
      const layout4Base = lenticularPanelImgLayout(
        { w: width, h: height },
        grid,
        4,
        boxW,
        boxH,
        crops.map((c) => ({ ...c, shiftY: 0 })),
        scale,
      )!;
      const layout4 = lenticularPanelImgLayout(
        { w: width, h: height },
        grid,
        4,
        boxW,
        boxH,
        crops,
        scale,
      )!;
      expect(layout0.top - layout0Base.top).toBeCloseTo(-17 * scale, 0);
      expect(layout4.top - layout4Base.top).toBeCloseTo(22 * scale, 0);
    });

    it("trims t4w4/t4w5 dual-face HR strips without white panel edges", async () => {
      const sharp = (await import("sharp")).default;
      const { readFileSync, existsSync } = await import("node:fs");
      const grid = { cols: 1, rows: 2 };
      const cases = [
        "data/naruto/kayou/cards/t4w2/en/nr.hr.057/art.narutocards.webp",
        "data/naruto/kayou/cards/t4w3/en/nr.hr.084/art.narutocards.webp",
        "data/naruto/kayou/cards/t4w4/en/nr.hr.121/art.narutocards.webp",
        "data/naruto/kayou/cards/t4w5/en/nr.hr.162/art.narutocards.webp",
        "data/naruto/kayou/cards/t4w5/en/nr.hr.163/art.narutocards.webp",
      ] as const;

      for (const path of cases) {
        if (!existsSync(path)) continue;
        const { data, info } = await sharp(readFileSync(path))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const rgba = new Uint8ClampedArray(data);
        const { crops, rowBounds } = resolveLenticularStripLayoutFromRgba(
          rgba,
          info.width,
          info.height,
          grid,
          undefined,
          { cropProfile: KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE },
        );
        expect(crops).toHaveLength(2);
        expect(rowBounds).toHaveLength(3);
        expect(rowBounds![0]).toBe(0);
        expect(rowBounds!.at(-1)).toBe(info.height);
        for (let panel = 0; panel < 2; panel += 1) {
          const crop = crops[panel]!;
          const contentW = info.width - crop.left - crop.right;
          const panelH =
            rowBounds![panel + 1]! - rowBounds![panel]!;
          const contentH = panelH - crop.top - crop.bottom;
          expect(contentW).toBeGreaterThanOrEqual(240);
          expect(contentH).toBeGreaterThanOrEqual(190);
        }
        if (path.includes("nr.hr.121")) {
          expect(crops[0]?.left).toBe(20);
          expect(crops[0]?.top).toBe(20);
          expect(info.width - crops[0]!.left - crops[0]!.right).toBe(280);
        }
        if (path.includes("nr.hr.162")) {
          expect(crops[0]?.bottom).toBeGreaterThanOrEqual(10);
        }
        if (path.includes("nr.hr.163")) {
          expect(crops[0]?.left).toBeLessThanOrEqual(22);
          expect(crops[0]?.right).toBeLessThanOrEqual(22);
          expect(info.width - crops[0]!.left - crops[0]!.right).toBeGreaterThanOrEqual(
            276,
          );
          expect(crops[1]?.left).toBeLessThanOrEqual(22);
        }
      }
    });

    it("does not snap hr-3x1 middle panel to top=0 on inter-row speckle", async () => {
      const { rgba, width, height } = await loadHeavenScrollRgba(
        `${HEAVEN_SCROLL_HR}/nrss.hr.003/art.narutocards.webp`,
      );
      const crops = detectLenticularPanelCropsFromRgba(rgba, width, height, {
        cols: 1,
        rows: 3,
      });
      expect(crops[1]?.top).toBeGreaterThanOrEqual(10);
    });

    it("uses one viewport size for every panel in a stack", async () => {
      const { rgba, width, height } = await loadHeavenScrollRgba(
        `${HEAVEN_SCROLL_HR}/nrss.hr.003/art.narutocards.webp`,
      );
      const grid = { cols: 1, rows: 3 };
      const crops = detectLenticularPanelCropsFromRgba(rgba, width, height, grid);
      expect(lenticularViewportContentSize(width, height, grid, crops)).toEqual({
        w: 180,
        h: 129,
      });
    });
  });

  it("aligns stacked panels to one viewport on hr-2x1 and hr-3x1 scans", async () => {
    const cases = [
      {
        path: `${HEAVEN_SCROLL_HR}/nrss.hr.008/art.narutocards.webp`,
        grid: { cols: 1, rows: 2 },
        aspect: "280 / 200",
      },
      {
        path: `${HEAVEN_SCROLL_HR}/nrss.hr.003/art.narutocards.webp`,
        grid: { cols: 1, rows: 3 },
        aspect: "180 / 129",
      },
    ] as const;

    for (const sample of cases) {
      const { rgba, width, height } = await loadHeavenScrollRgba(sample.path);
      const crops = detectLenticularPanelCropsFromRgba(
        rgba,
        width,
        height,
        sample.grid,
      );
      expect(
        lenticularArtAspectRatio(width, height, sample.grid, 0, crops),
      ).toBe(sample.aspect);
      const [viewportW, viewportH] = sample.aspect.split(" / ").map(Number);
      const pair = lenticularPairImgLayouts(
        { w: width, h: height },
        sample.grid,
        0,
        1,
        viewportW,
        viewportH,
        crops,
      )!;
      expect(pair.a.left).toBe(pair.b.left);
      expect(pair.b.top).toBeLessThan(pair.a.top);
    }
  });
});
