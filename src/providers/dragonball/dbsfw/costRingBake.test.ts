import { describe, expect, it } from "vitest";

import {
  bakeCostNumberBadge,
  bakeCostRingFill,
  opaqueDiscLayout,
  trimOpaqueRgba,
} from "./costRingBake";
import { DEFAULT_COST_RING_GEOMETRY } from "./costRingGeometry";

describe("trimOpaqueRgba", () => {
  it("drops transparent atlas padding around a disc", () => {
    const w = 16;
    const h = 16;
    const rgba = Buffer.alloc(w * h * 4, 0);
    for (let y = 4; y <= 10; y += 1) {
      for (let x = 5; x <= 11; x += 1) {
        rgba[(y * w + x) * 4 + 3] = 255;
      }
    }
    const trimmed = trimOpaqueRgba(rgba, w, h)!;
    expect(trimmed.width).toBe(7);
    expect(trimmed.height).toBe(7);
  });
});

describe("opaqueDiscLayout", () => {
  it("uses the shorter opaque edge so soft fluff does not inflate diam", () => {
    const w = 32;
    const h = 32;
    const rgba = Buffer.alloc(w * h * 4, 0);
    // 10×10 hard disc + 6 px soft fluff only on +X.
    for (let y = 10; y < 20; y += 1) {
      for (let x = 10; x < 20; x += 1) {
        rgba[(y * w + x) * 4 + 3] = 255;
      }
    }
    for (let y = 12; y < 18; y += 1) {
      for (let x = 20; x < 26; x += 1) {
        rgba[(y * w + x) * 4 + 3] = 50;
      }
    }
    const layout = opaqueDiscLayout(rgba, w, h)!;
    expect(layout.diam).toBe(10);
    expect(layout.cx).toBeGreaterThan(14);
    expect(layout.cx).toBeLessThan(18);
  });
});

describe("bakeCostNumberBadge", () => {
  function makeDiscLayout(
    layoutW: number,
    layoutH: number,
    x0: number,
    y0: number,
    size: number,
  ): Buffer {
    const layout = Buffer.alloc(layoutW * layoutH * 4, 0);
    for (let y = y0; y < y0 + size; y += 1) {
      for (let x = x0; x < x0 + size; x += 1) {
        const i = (y * layoutW + x) * 4;
        layout[i] = 200;
        layout[i + 1] = 100;
        layout[i + 2] = 0;
        layout[i + 3] = 255;
      }
    }
    return layout;
  }

  function makeSprite(size: number): Buffer {
    const sprite = Buffer.alloc(size * size * 4, 0);
    for (let y = 2; y < size - 2; y += 1) {
      for (let x = 2; x < size - 2; x += 1) {
        const i = (y * size + x) * 4;
        sprite[i] = 255;
        sprite[i + 1] = 255;
        sprite[i + 2] = 255;
        sprite[i + 3] = 255;
      }
    }
    return sprite;
  }

  it("places the BattleCard sprite on a transparent card using layout centre", async () => {
    const layoutW = 64;
    const layoutH = 64;
    const layout = makeDiscLayout(layoutW, layoutH, 8, 8, 16);
    const sprite = makeSprite(16);
    const cardW = 128;
    const cardH = 128;
    const baked = await bakeCostNumberBadge(
      sprite,
      16,
      16,
      layout,
      layoutW,
      layoutH,
      cardW,
      cardH,
      2,
    );
    let opaque = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < cardH; y += 1) {
      for (let x = 0; x < cardW; x += 1) {
        const a = baked[(y * cardW + x) * 4 + 3] ?? 0;
        if (a < 40) continue;
        opaque += 1;
        sx += x;
        sy += y;
      }
    }
    expect(opaque).toBeGreaterThan(50);
    expect(Math.abs(sx / opaque - 32)).toBeLessThan(2);
    expect(Math.abs(sy / opaque - 32)).toBeLessThan(2);
  });

  it("sizes the badge by layout height scale (print-widen must not shrink)", async () => {
    // 16² gem in 64² atlas → diam 16. Print-widen 48×64 (¾ width) must keep
    // diam = 16 * (64/64) = 16, not min(scale)*16 = 12.
    const layoutW = 64;
    const layoutH = 64;
    const layout = makeDiscLayout(layoutW, layoutH, 8, 8, 16);
    const sprite = makeSprite(16);
    const cardW = 48;
    const cardH = 64;
    const baked = await bakeCostNumberBadge(
      sprite,
      16,
      16,
      layout,
      layoutW,
      layoutH,
      cardW,
      cardH,
      1,
    );
    let minX = cardW;
    let maxX = 0;
    let minY = cardH;
    let maxY = 0;
    for (let y = 0; y < cardH; y += 1) {
      for (let x = 0; x < cardW; x += 1) {
        const a = baked[(y * cardW + x) * 4 + 3] ?? 0;
        if (a < 40) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const diam = Math.min(maxX - minX + 1, maxY - minY + 1);
    expect(diam).toBeGreaterThanOrEqual(14);
    expect(diam).toBeLessThanOrEqual(18);
  });
});

describe("bakeCostRingFill", () => {
  it("supersamples then softens the fill edge versus a hard 20² blit", async () => {
    const ringW = 64;
    const ringH = 64;
    const ring = Buffer.alloc(ringW * ringH * 4, 0);
    // Dark socket disc.
    for (let y = 16; y < 48; y += 1) {
      for (let x = 16; x < 48; x += 1) {
        const i = (y * ringW + x) * 4;
        ring[i] = 20;
        ring[i + 1] = 20;
        ring[i + 2] = 20;
        ring[i + 3] = 255;
      }
    }
    // Hard square fill (stands in for a non-smooth source disc).
    const fill = Buffer.alloc(32 * 32 * 4, 0);
    for (let y = 4; y < 28; y += 1) {
      for (let x = 4; x < 28; x += 1) {
        const i = (y * 32 + x) * 4;
        fill[i] = 40;
        fill[i + 1] = 80;
        fill[i + 2] = 200;
        fill[i + 3] = 255;
      }
    }
    const geom = {
      ...DEFAULT_COST_RING_GEOMETRY,
      center: { x: 32, y: 32 },
      outerCenter: { x: 32, y: 32 },
      atlasSize: 64,
      outerDiam: 32,
      fillSize: 32,
    };
    const baked = await bakeCostRingFill(
      ring,
      ringW,
      ringH,
      fill,
      32,
      32,
      geom,
      20,
      4,
    );
    // Opaque-over-opaque AA lives in RGB: edge pixels sit between socket
    // blue (~20) and fill blue (~200).
    let solidBlue = 0;
    let fringeBlue = 0;
    for (let y = 0; y < ringH; y += 1) {
      for (let x = 0; x < ringW; x += 1) {
        const b = baked[(y * ringW + x) * 4 + 2] ?? 0;
        if (b >= 160) solidBlue += 1;
        else if (b >= 50 && b < 160) fringeBlue += 1;
      }
    }
    expect(solidBlue).toBeGreaterThan(0);
    expect(fringeBlue).toBeGreaterThan(0);
  });
});
