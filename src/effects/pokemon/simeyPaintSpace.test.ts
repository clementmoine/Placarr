import { describe, expect, it } from "vitest";

import {
  LIVE_ETCH_TYPICAL_MU,
  SIMEY_FOIL_TARGET_MU,
  detectPaintPolarity,
  luminanceRgb,
  meanLuminanceRgba,
  projectRgbToSimeyFoil,
  projectRgbaBufferToSimeyFoil,
} from "./simeyPaintSpace";

describe("simeyPaintSpace", () => {
  it("classifies Live etch μ as dark-on-light and Simey μ as light-on-dark", () => {
    expect(detectPaintPolarity(LIVE_ETCH_TYPICAL_MU)).toBe("darkOnLight");
    expect(detectPaintPolarity(SIMEY_FOIL_TARGET_MU)).toBe("lightOnDark");
    expect(detectPaintPolarity(100)).toBe("ambiguous");
  });

  it("projects a Live-like light pixel toward Simey foil space", () => {
    const [r, g, b] = projectRgbToSimeyFoil(240, 240, 240, "darkOnLight", {
      sourceMu: LIVE_ETCH_TYPICAL_MU,
    });
    // Invert → ~15, then gain toward μ26 — still dark (foil line on black).
    expect(luminanceRgb(r, g, b)).toBeLessThan(80);
    expect(r).toBeLessThan(240);
  });

  it("inverts + gains a synthetic Live etch buffer toward Simey μ", () => {
    // 2×2: three light bg pixels + one dark etch line (μ high, Live-like).
    const data = new Uint8ClampedArray([
      220, 220, 220, 255, 220, 220, 220, 255, 220, 220, 220, 255, 40, 40, 40,
      255,
    ]);
    const before = meanLuminanceRgba(data);
    expect(detectPaintPolarity(before)).toBe("darkOnLight");
    const { polarity, gain } = projectRgbaBufferToSimeyFoil(data);
    expect(polarity).toBe("darkOnLight");
    expect(gain).toBeGreaterThan(0);
    const after = meanLuminanceRgba(data);
    expect(after).toBeLessThan(before);
    expect(after).toBeLessThan(100);
  });
});
