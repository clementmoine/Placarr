import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  FETCHED_IMAGE_MAX_SIDE,
  toUploadWebp,
  WEBP_MAX_SIDE,
} from "./losslessWebp";

/** A plain raster of the given size — cheap to build, cheap to encode. */
function solid(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 120, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

async function sizeOf(buffer: Buffer): Promise<{ w: number; h: number }> {
  const meta = await sharp(buffer).metadata();
  return { w: meta.width ?? 0, h: meta.height ?? 0 };
}

describe("toUploadWebp", () => {
  it("encodes as webp and leaves a reasonable image at its own size", async () => {
    const out = await toUploadWebp(await solid(600, 825));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect({ w: meta.width, h: meta.height }).toEqual({ w: 600, h: 825 });
  });

  it("bounds the longest side to `maxSide`, keeping the ratio", async () => {
    const out = await toUploadWebp(await solid(1000, 400), { maxSide: 500 });
    const { w, h } = await sizeOf(out);
    expect(w).toBe(500);
    expect(h).toBe(200);
  });

  it("never enlarges to reach `maxSide`", async () => {
    const out = await toUploadWebp(await solid(120, 60), { maxSide: 4096 });
    expect(await sizeOf(out)).toEqual({ w: 120, h: 60 });
  });

  it("rescues an image WebP could not otherwise hold", async () => {
    // Regression: SteamGridDB clear logos arrived at 31980×14135 and the
    // encoder refused them outright — "Processed image is too large for the
    // WebP format" — so they stayed as multi-megabyte PNGs.
    const out = await toUploadWebp(await solid(WEBP_MAX_SIDE + 17, 10));
    const { w } = await sizeOf(out);
    expect(w).toBeLessThanOrEqual(WEBP_MAX_SIDE);
  });

  it("holds a fetched image to the fetch ceiling", async () => {
    const out = await toUploadWebp(await solid(9000, 3000), {
      maxSide: FETCHED_IMAGE_MAX_SIDE,
    });
    const { w, h } = await sizeOf(out);
    expect(w).toBe(FETCHED_IMAGE_MAX_SIDE);
    expect(h).toBe(Math.round(FETCHED_IMAGE_MAX_SIDE / 3));
  });
});
