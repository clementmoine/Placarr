import { describe, expect, it } from "vitest";

import { detectKayouScanContentCrop, kayouScanContentAspectRatio } from "./kayouScanCrop";

describe("kayouScanCrop", () => {
  it("computes aspect ratio from crop insets", () => {
    expect(kayouScanContentAspectRatio(320, 450, { left: 0, top: 0, right: 0, bottom: 4 })).toBe(
      "320 / 446",
    );
  });

  it("detects gutter crop on Isobu single-face HR scan when art is present", async () => {
    const sharp = (await import("sharp")).default;
    const { readFileSync, existsSync } = await import("node:fs");
    const art =
      "data/naruto/kayou/cards/t4w1/en/nr.hr.003/art.narutocards.webp";
    if (!existsSync(art)) return;

    const { data, info } = await sharp(readFileSync(art))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const crop = detectKayouScanContentCrop(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
    );
    expect(crop.bottom).toBeGreaterThanOrEqual(0);
    expect(crop.left + crop.right).toBeLessThan(info.width / 4);
    expect(crop.top + crop.bottom).toBeLessThan(info.height / 4);
  });
});
