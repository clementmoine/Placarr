import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  bakeCoverageMask,
  maskUploadPath,
} from "@/core/enrich/media/maskDownload";

/** A 2x1 image: one pixel with blue at 0, one with blue at full. */
async function normalMapStrip(blueLeft: number, blueRight: number) {
  return sharp(
    Buffer.from([
      // R    G    B                 R    G    B
      127,
      128,
      blueLeft,
      127,
      128,
      blueRight,
    ]),
    { raw: { width: 2, height: 1, channels: 3 } },
  )
    .png()
    .toBuffer();
}

async function greyValues(png: Buffer): Promise<number[]> {
  const { data, info } = await sharp(png)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Array.from({ length: info.width }, (_, x) => data[x * info.channels]);
}

describe("bakeCoverageMask", () => {
  it("turns the blue channel into the brightness the mask is read by", async () => {
    // This is the `feColorMatrix` that used to run per frame: B into all three.
    const baked = await bakeCoverageMask(await normalMapStrip(0, 255));

    expect(await greyValues(baked)).toEqual([0, 255]);
  });

  it("does not let a normal map's flat mid-grey through as half coverage", async () => {
    // Read as luminance untouched, a normal map is ~mid-grey everywhere, so the
    // coat washed over the whole card at half strength instead of landing on the
    // engraved line work.
    const raw = await normalMapStrip(0, 0);
    const untouched = await greyValues(await sharp(raw).png().toBuffer());
    const baked = await greyValues(await bakeCoverageMask(raw));

    expect(untouched[0]).toBeGreaterThan(60);
    expect(baked).toEqual([0, 0]);
  });

  it("keeps the gradient rather than thresholding it", async () => {
    // Coverage is not binary; a hard cut would give the coat jagged edges.
    const baked = await bakeCoverageMask(await normalMapStrip(64, 192));

    expect(await greyValues(baked)).toEqual([64, 192]);
  });
});

describe("maskUploadPath", () => {
  it("keeps the raw and baked forms of one file apart", () => {
    const url = "https://api.lorcana.ravensburger.com/images/fr/set1/17_ab.jpg";

    expect(maskUploadPath(url, false)).not.toBe(maskUploadPath(url, true));
  });

  it("writes a baked mask as PNG, whatever the source was", () => {
    // Re-encoding a greyscale coverage gradient as JPEG would band it.
    expect(maskUploadPath("https://x.test/a.jpg", true)).toMatch(/\.png$/);
  });

  it("keeps the source extension for a mask it does not touch", () => {
    expect(maskUploadPath("https://x.test/a.jpg", false)).toMatch(/\.jpg$/);
    expect(maskUploadPath("https://x.test/a.png", false)).toMatch(/\.png$/);
  });

  it("falls back to jpg rather than trusting an odd path", () => {
    expect(maskUploadPath("https://x.test/mask", false)).toMatch(/\.jpg$/);
    expect(maskUploadPath("https://x.test/a.svg", false)).toMatch(/\.jpg$/);
  });

  it("is stable, so a second visit finds the file already there", () => {
    expect(maskUploadPath("https://x.test/a.jpg", true)).toBe(
      maskUploadPath("https://x.test/a.jpg", true),
    );
  });
});
