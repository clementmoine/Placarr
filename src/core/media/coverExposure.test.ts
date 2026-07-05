import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { exposureScoreAdjustment } from "./coverExposure";
import { measureCoverExposureFromBuffer } from "./coverExposure.server";

async function solidImage(
  red: number,
  green: number,
  blue: number,
  width = 120,
  height = 180,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: red, g: green, b: blue },
    },
  })
    .jpeg()
    .toBuffer();
}

describe("coverExposure", () => {
  it("mesure la luminance moyenne et la part de pixels sombres", async () => {
    const bright = await solidImage(220, 220, 220);
    const dark = await solidImage(40, 40, 40);

    expect(await measureCoverExposureFromBuffer(bright)).toEqual({
      meanLuminance: 220,
      darkPixelRatio: 0,
    });
    expect(await measureCoverExposureFromBuffer(dark)).toEqual({
      meanLuminance: 40,
      darkPixelRatio: 1,
    });
  });

  it("penalise les scans sous-exposes sans toucher aux couvertures lumineuses", () => {
    expect(
      exposureScoreAdjustment({ meanLuminance: 84, darkPixelRatio: 0.52 }),
    ).toBe(-360);
    expect(
      exposureScoreAdjustment({ meanLuminance: 147, darkPixelRatio: 0.06 }),
    ).toBe(0);
    expect(
      exposureScoreAdjustment({ meanLuminance: 178, darkPixelRatio: 0.08 }),
    ).toBe(0);
  });
});
