import { describe, expect, it } from "vitest";

import {
  quadSafeForIdentifyCrop,
  rectifiedBandGeometry,
  rectifiedFaceSize,
  RECTIFIED_BAND_MAX_WIDTH,
  RECTIFIED_FACE_MAX_EDGE,
} from "./rectifyCardFace";
import { OCR_BAND_HEIGHT_FRAC } from "./collectorOcr";
import type { WarpQuad } from "@/lib/shared/vision/perspectiveWarp";

function rotatedQuad(
  cx: number,
  cy: number,
  w: number,
  h: number,
  deg: number,
): WarpQuad {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const pt = (u: number, v: number) => ({
    x: cx + u * cos - v * sin,
    y: cy + u * sin + v * cos,
  });
  return [
    pt(-w / 2, -h / 2),
    pt(w / 2, -h / 2),
    pt(w / 2, h / 2),
    pt(-w / 2, h / 2),
  ];
}

const VW = 1080;
const VH = 1920;

describe("quadSafeForIdentifyCrop", () => {
  it.each([0, 15, 30, 44])("accepts a 63:88 card tilted %i°", (deg) => {
    const q = rotatedQuad(540, 960, 630, 880, deg);
    expect(quadSafeForIdentifyCrop(q, VW, VH)).not.toBeNull();
  });

  it("accepts a card lying on its side and turns it upright", () => {
    const q = rotatedQuad(540, 960, 880, 630, 0);
    const safe = quadSafeForIdentifyCrop(q, VW, VH);
    expect(safe).not.toBeNull();
    const top = Math.hypot(safe![1].x - safe![0].x, safe![1].y - safe![0].y);
    const side = Math.hypot(safe![3].x - safe![0].x, safe![3].y - safe![0].y);
    expect(top).toBeLessThan(side);
  });

  it("rejects the whole-table lozenge the old scanline pass produced", () => {
    // Real Lorcana failure: a quad spanning the frame with wildly unequal sides.
    const q: WarpQuad = [
      { x: 23, y: 218 },
      { x: 454, y: 208 },
      { x: 424, y: 619 },
      { x: 12, y: 862 },
    ];
    expect(quadSafeForIdentifyCrop(q, 470, 888)).toBeNull();
  });

  it.each([
    ["square", rotatedQuad(540, 960, 700, 700, 0)],
    ["sliver", rotatedQuad(540, 960, 120, 880, 0)],
    ["tiny", rotatedQuad(540, 960, 63, 88, 0)],
    ["frame-filling", rotatedQuad(540, 960, 1070, 1900, 0)],
  ])("rejects a %s quad", (_label, q) => {
    expect(quadSafeForIdentifyCrop(q, VW, VH)).toBeNull();
  });

  it("rejects a non-convex (bow-tie) quad", () => {
    const q: WarpQuad = [
      { x: 200, y: 200 },
      { x: 800, y: 1200 },
      { x: 800, y: 200 },
      { x: 200, y: 1200 },
    ];
    expect(quadSafeForIdentifyCrop(q, VW, VH)).toBeNull();
  });

  it("rejects null / NaN input", () => {
    expect(quadSafeForIdentifyCrop(null, VW, VH)).toBeNull();
    const q = rotatedQuad(540, 960, 630, 880, 0);
    q[0].x = Number.NaN;
    expect(quadSafeForIdentifyCrop(q, VW, VH)).toBeNull();
  });
});

describe("rectifiedFaceSize / rectifiedBandGeometry", () => {
  it("caps the identify face long edge and keeps the card aspect", () => {
    const q = rotatedQuad(540, 960, 630, 880, 20);
    const size = rectifiedFaceSize(q);
    expect(Math.max(size.width, size.height)).toBe(RECTIFIED_FACE_MAX_EDGE);
    expect(size.width / size.height).toBeCloseTo(630 / 880, 1);
  });

  it("keeps the band at native width (OCR needs the pixels) and footer rows", () => {
    const q = rotatedQuad(540, 960, 900, 1257, 10);
    const geo = rectifiedBandGeometry(q);
    expect(geo.faceWidth).toBe(900);
    expect(geo.band.sh).toBe(Math.floor(geo.faceHeight * OCR_BAND_HEIGHT_FRAC));
    expect(geo.band.sy + geo.band.sh).toBeLessThanOrEqual(geo.faceHeight);
  });

  it("never exceeds the OCR width cap", () => {
    const q = rotatedQuad(2000, 2000, 2600, 3600, 0);
    const geo = rectifiedBandGeometry(q);
    expect(geo.faceWidth).toBe(RECTIFIED_BAND_MAX_WIDTH);
  });
});
