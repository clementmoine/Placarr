import { describe, expect, it } from "vitest";

import { bakeCostRingFill, trimOpaqueRgba } from "./costRingBake";
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
