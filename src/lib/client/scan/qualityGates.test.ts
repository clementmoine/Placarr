import { describe, expect, it } from "vitest";

import {
  evaluateQualityGates,
  laplacianVariance,
  looksLikeCardBack,
} from "@/lib/client/scan/qualityGates";

function solidRgba(
  w: number,
  h: number,
  rgb: [number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return data;
}

function checkerRgba(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = (x + y) % 2 === 0;
      const v = on ? 255 : 0;
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("laplacianVariance", () => {
  it("is near zero on flat gray", () => {
    const gray = new Float32Array(16 * 16).fill(128);
    expect(laplacianVariance(gray, 16, 16)).toBeLessThan(1);
  });

  it("is high on checkerboard", () => {
    const gray = new Float32Array(16 * 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        gray[y * 16 + x] = (x + y) % 2 === 0 ? 255 : 0;
      }
    }
    expect(laplacianVariance(gray, 16, 16)).toBeGreaterThan(100);
  });
});

describe("evaluateQualityGates", () => {
  it("rejects too-far ROI", () => {
    const data = checkerRgba(32, 32);
    const r = evaluateQualityGates({
      data,
      width: 32,
      height: 32,
      sourceEdgePx: 40,
    });
    expect(r.ok).toBe(false);
    expect(r.hint).toBe("too_far");
  });

  it("rejects flat dark frame as too_dark", () => {
    const data = solidRgba(64, 64, [10, 10, 10]);
    const r = evaluateQualityGates(
      {
        data,
        width: 64,
        height: 64,
        sourceEdgePx: 200,
      },
      { minBlurVariance: 0 },
    );
    expect(r.ok).toBe(false);
    expect(r.hint).toBe("too_dark");
  });

  it("passes a sharp mid-tone coloured checker", () => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const on = (x + y) % 2 === 0;
        const i = (y * 64 + x) * 4;
        data[i] = on ? 40 : 200;
        data[i + 1] = on ? 120 : 60;
        data[i + 2] = on ? 200 : 40;
        data[i + 3] = 255;
      }
    }
    const r = evaluateQualityGates({
      data,
      width: 64,
      height: 64,
      sourceEdgePx: 200,
    });
    expect(r.hint).toBe("ok");
    expect(r.ok).toBe(true);
    expect(r.blurVariance).toBeGreaterThan(80);
  });
});

describe("looksLikeCardBack", () => {
  it("flags flat desaturated art band", () => {
    const data = solidRgba(48, 64, [90, 85, 80]);
    expect(
      looksLikeCardBack({
        data,
        width: 48,
        height: 64,
        sourceEdgePx: 200,
      }),
    ).toBe(true);
  });

  it("does not flag a busy checker", () => {
    const data = checkerRgba(48, 64);
    expect(
      looksLikeCardBack({
        data,
        width: 48,
        height: 64,
        sourceEdgePx: 200,
      }),
    ).toBe(false);
  });
});
