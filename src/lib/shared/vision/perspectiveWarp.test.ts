import { describe, expect, it } from "vitest";

import {
  applyHomography,
  computeHomographyDestToSource,
  quadNaturalSize,
  uprightPortraitQuad,
  warpQuadToRect,
  type WarpQuad,
} from "./perspectiveWarp";

/** Rotate the corners of a w×h rectangle by `deg` around (cx, cy). */
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

/**
 * Paint a 200×200 RGB image with a 30°-rotated card whose top half is red
 * and bottom half is blue, with a distinct green footer stripe.
 */
function paintRotatedCard(deg: number) {
  const W = 200;
  const H = 200;
  const data = new Uint8Array(W * H * 3).fill(240);
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const cw = 60;
  const ch = 90;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - 100;
      const dy = y - 100;
      const u = dx * cos + dy * sin + cw / 2;
      const v = -dx * sin + dy * cos + ch / 2;
      if (u < 0 || v < 0 || u >= cw || v >= ch) continue;
      const o = (y * W + x) * 3;
      if (v >= ch * 0.88) {
        data[o] = 0;
        data[o + 1] = 200;
        data[o + 2] = 0;
      } else if (v < ch / 2) {
        data[o] = 200;
        data[o + 1] = 0;
        data[o + 2] = 0;
      } else {
        data[o] = 0;
        data[o + 1] = 0;
        data[o + 2] = 200;
      }
    }
  }
  return { data, width: W, height: H, channels: 3, cw, ch };
}

describe("computeHomographyDestToSource", () => {
  it("maps dest corners exactly onto source corners", () => {
    const src = rotatedQuad(100, 100, 60, 90, 25);
    const dest: WarpQuad = [
      { x: 0, y: 0 },
      { x: 59, y: 0 },
      { x: 59, y: 89 },
      { x: 0, y: 89 },
    ];
    const H = computeHomographyDestToSource(src, dest);
    dest.forEach((d, i) => {
      const s = applyHomography(H, d.x, d.y);
      expect(s.x).toBeCloseTo(src[i]!.x, 6);
      expect(s.y).toBeCloseTo(src[i]!.y, 6);
    });
  });
});

describe("warpQuadToRect", () => {
  it("rectifies a 30° card: red top, blue bottom, green footer", () => {
    const img = paintRotatedCard(30);
    const quad = rotatedQuad(100, 100, img.cw - 1, img.ch - 1, 30);
    const out = warpQuadToRect(img, quad, { outWidth: 60, outHeight: 90 });
    expect(out.width).toBe(60);
    expect(out.height).toBe(90);
    const px = (x: number, y: number) => {
      const o = (y * out.width + x) * 3;
      return [out.data[o]!, out.data[o + 1]!, out.data[o + 2]!];
    };
    expect(px(30, 20)[0]).toBeGreaterThan(150); // red
    expect(px(30, 60)[2]).toBeGreaterThan(150); // blue
    expect(px(30, 85)[1]).toBeGreaterThan(150); // green footer
    // No table colour leaks in at the centre of each zone.
    expect(px(30, 20)[2]).toBeLessThan(60);
  });

  it("renders only the requested rows (footer band) at full width", () => {
    const img = paintRotatedCard(30);
    const quad = rotatedQuad(100, 100, img.cw - 1, img.ch - 1, 30);
    const out = warpQuadToRect(img, quad, {
      outWidth: 120,
      outHeight: 180,
      rows: { start: 160, end: 180 },
    });
    expect(out.width).toBe(120);
    expect(out.height).toBe(20);
    let green = 0;
    for (let i = 0; i < out.data.length; i += 3) {
      if (out.data[i + 1]! > 150 && out.data[i]! < 60) green += 1;
    }
    expect(green / (out.width * out.height)).toBeGreaterThan(0.85);
  });
});

describe("quadNaturalSize / uprightPortraitQuad", () => {
  it("recovers side lengths of a rotated rectangle", () => {
    const size = quadNaturalSize(rotatedQuad(0, 0, 63, 88, 40));
    expect(size.width).toBe(63);
    expect(size.height).toBe(88);
  });

  it("keeps an upright card and quarter-turns a sideways one", () => {
    const upright = rotatedQuad(0, 0, 63, 88, 20);
    expect(uprightPortraitQuad(upright)).toBe(upright);
    const sideways = rotatedQuad(0, 0, 88, 63, 0);
    const fixed = uprightPortraitQuad(sideways);
    const size = quadNaturalSize(fixed);
    expect(size.width).toBe(63);
    expect(size.height).toBe(88);
  });
});
