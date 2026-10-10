import { describe, expect, it } from "vitest";

import {
  boxDimensions,
  clampBoxPitch,
  spineDepthFraction,
  BOX_PITCH_LIMIT,
} from "./GameBox3D";

describe("clampBoxPitch", () => {
  it("keeps the box from going belly-up", () => {
    expect(clampBoxPitch(0)).toBe(0);
    expect(clampBoxPitch(90)).toBe(BOX_PITCH_LIMIT);
    expect(clampBoxPitch(-90)).toBe(-BOX_PITCH_LIMIT);
  });
});

describe("spineDepthFraction", () => {
  it("reads portrait spines as depth vs height", () => {
    // Slim DVD-style spine: 80×600 → short/long = 80/600.
    expect(spineDepthFraction(80, 600)).toEqual({
      landscape: false,
      ratio: 80 / 600,
    });
  });

  it("reads landscape N64-style strips as depth vs width", () => {
    expect(spineDepthFraction(600, 80)).toEqual({
      landscape: true,
      ratio: 80 / 600,
    });
  });

  it("caps malformed near-square spines so depth cannot explode", () => {
    expect(spineDepthFraction(100, 100).ratio).toBe(0.3);
  });
});

describe("boxDimensions", () => {
  it("derives height from the front ratio and depth from the spine", () => {
    // Front 715×1000 → ratio 0.715; portrait spine fraction 0.12 of height.
    const { heightPx, depthPx } = boxDimensions(286, 0.715, 0.12, false);
    expect(heightPx).toBeCloseTo(286 / 0.715, 5);
    expect(depthPx).toBeCloseTo(heightPx * 0.12, 5);
  });

  it("scales landscape spines against width", () => {
    const { depthPx } = boxDimensions(400, 0.8, 0.1, true);
    expect(depthPx).toBeCloseTo(40, 5);
  });
});
