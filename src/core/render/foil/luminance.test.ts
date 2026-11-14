import { describe, expect, it } from "vitest";

import { luminanceRgb, meanLuminanceRgba } from "@/core/render/foil/luminance";

describe("luminance", () => {
  it("uses Rec. 709 weights", () => {
    expect(luminanceRgb(255, 255, 255)).toBeCloseTo(255);
    expect(luminanceRgb(255, 0, 0)).toBeCloseTo(0.2126 * 255);
  });

  it("averages RGBA pixels and ignores alpha", () => {
    const data = [255, 0, 0, 0, 0, 255, 0, 255];
    expect(meanLuminanceRgba(data)).toBeCloseTo(
      (luminanceRgb(255, 0, 0) + luminanceRgb(0, 255, 0)) / 2,
    );
  });
});
