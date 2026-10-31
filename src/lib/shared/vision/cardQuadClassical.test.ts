import { describe, expect, it } from "vitest";

import {
  detectCardQuadFromGray,
  extremePointQuad,
  insetQuad,
  rgbaToGray,
} from "./cardQuadClassical";

describe("insetQuad", () => {
  it("moves corners toward the center", () => {
    const inset = insetQuad(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 200 },
        { x: 0, y: 200 },
      ],
      0.1,
    );
    expect(inset[0]!.x).toBeGreaterThan(0);
    expect(inset[0]!.y).toBeGreaterThan(0);
    expect(inset[2]!.x).toBeLessThan(100);
    expect(inset[2]!.y).toBeLessThan(200);
  });
});

describe("extremePointQuad", () => {
  it("recovers corners of a filled axis-aligned rectangle", () => {
    const width = 40;
    const height = 60;
    const pixels: number[] = [];
    for (let y = 10; y <= 50; y++) {
      for (let x = 8; x <= 28; x++) {
        pixels.push(y * width + x);
      }
    }
    const quad = extremePointQuad(pixels, width);
    expect(quad).not.toBeNull();
    const [tl, tr, br, bl] = quad!;
    expect(tl).toEqual({ x: 8, y: 10 });
    expect(tr).toEqual({ x: 28, y: 10 });
    expect(br).toEqual({ x: 28, y: 50 });
    expect(bl).toEqual({ x: 8, y: 50 });
  });
});

describe("detectCardQuadFromGray", () => {
  it("finds a bright card-shaped rectangle on a dark field", () => {
    const fullW = 400;
    const fullH = 300;
    const dw = 200;
    const dh = 150;
    const gray = new Uint8Array(dw * dh);
    gray.fill(28);
    // Portrait card ≈ 63/88 centered in downscale space.
    const cardW = 63;
    const cardH = 88;
    const left = Math.round((dw - cardW) / 2);
    const top = Math.round((dh - cardH) / 2);
    for (let y = top; y < top + cardH; y++) {
      for (let x = left; x < left + cardW; x++) {
        gray[y * dw + x] = 220;
      }
    }
    const found = detectCardQuadFromGray(gray, dw, dh, fullW, fullH);
    expect(found).not.toBeNull();
    expect(found!.coverage).toBeGreaterThan(0.1);
    expect(found!.aabb.width).toBeGreaterThan(fullW * 0.2);
    expect(found!.aabb.height).toBeGreaterThan(fullH * 0.3);
  });

  it("finds a dark-bordered card on a bright desk (live phone case)", () => {
    const fullW = 400;
    const fullH = 700;
    const dw = 200;
    const dh = 350;
    const gray = new Uint8Array(dw * dh);
    gray.fill(210); // bright table
    const cardW = 90;
    const cardH = 126; // ~63/88
    const left = Math.round((dw - cardW) / 2);
    const top = Math.round((dh - cardH) / 2);
    for (let y = top; y < top + cardH; y++) {
      for (let x = left; x < left + cardW; x++) {
        const border =
          x <= left + 2 ||
          x >= left + cardW - 3 ||
          y <= top + 2 ||
          y >= top + cardH - 3;
        gray[y * dw + x] = border ? 20 : 160;
      }
    }
    const found = detectCardQuadFromGray(gray, dw, dh, fullW, fullH);
    expect(found).not.toBeNull();
    expect(found!.coverage).toBeGreaterThan(0.08);
    expect(found!.coverage).toBeLessThan(0.78);
    expect(found!.aabb.height).toBeGreaterThan(found!.aabb.width);
  });
});

describe("rgbaToGray", () => {
  it("packs luminance", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const g = rgbaToGray(rgba, 2, 1);
    expect(g.length).toBe(2);
    expect(g[0]).toBeGreaterThan(50);
    expect(g[1]).toBeGreaterThan(100);
  });
});
