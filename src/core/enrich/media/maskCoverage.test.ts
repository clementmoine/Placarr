import { describe, expect, it } from "vitest";

import {
  alphaIsUniformOpaque,
  applyMaskCoverage,
  lumaOf,
  normalMapCoverage,
} from "./maskCoverage";

describe("maskCoverage", () => {
  it("uses BT.601 luma for foil", () => {
    expect(lumaOf(255, 0, 0)).toBeCloseTo(76.245, 2);
  });

  it("decodes normal-map coverage for varnish", () => {
    // Flat-ish normal (128,128,255) → low coverage; bright channels raise it.
    expect(normalMapCoverage(255, 255, 255)).toBeGreaterThan(200);
    expect(normalMapCoverage(0, 0, 0)).toBe(0);
  });

  it("bakes foil coverage into alpha (anti-wash JPEG)", () => {
    const pixels = new Uint8ClampedArray([
      200,
      100,
      50,
      255, // opaque JPEG pixel
      10,
      10,
      10,
      255,
    ]);
    applyMaskCoverage(pixels, "foil");
    expect(pixels[3]).toBe(Math.round(lumaOf(200, 100, 50)));
    expect(pixels[7]).toBe(Math.round(lumaOf(10, 10, 10)));
    expect(pixels[3]).toBeGreaterThan(pixels[7]!);
  });

  it("detects uniform opaque alpha (publisher JPEG)", () => {
    const opaque = new Uint8ClampedArray(4 * 8);
    for (let i = 0; i < 8; i += 1) {
      opaque[i * 4 + 3] = 255;
    }
    expect(alphaIsUniformOpaque(opaque, 1)).toBe(true);

    opaque[3] = 128;
    expect(alphaIsUniformOpaque(opaque, 1)).toBe(false);
  });
});
