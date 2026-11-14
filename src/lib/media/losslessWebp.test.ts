import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  FETCHED_IMAGE_MAX_SIDE,
  toUploadWebp,
  WEBP_MAX_SIDE,
  writeBufferIfChanged,
  writeLosslessWebpFile,
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

describe("writeBufferIfChanged", () => {
  it("skips rewrite when bytes are identical (mtime stable)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "webp-if-"));
    const dest = path.join(dir, "face.webp");
    const payload = Buffer.from("same-bytes");
    expect(writeBufferIfChanged(dest, payload)).toBe(true);
    const mtimeMs = statSync(dest).mtimeMs;
    expect(writeBufferIfChanged(dest, Buffer.from("same-bytes"))).toBe(false);
    expect(statSync(dest).mtimeMs).toBe(mtimeMs);
    expect(readFileSync(dest)).toEqual(payload);
  });

  it("rewrites when bytes differ", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "webp-if-"));
    const dest = path.join(dir, "face.webp");
    writeFileSync(dest, "old");
    expect(writeBufferIfChanged(dest, Buffer.from("new"))).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe("new");
  });
});

describe("writeLosslessWebpFile", () => {
  it("does not bump mtime when re-encoding yields the same webp", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lossless-webp-"));
    const dest = path.join(dir, "art.webp");
    const png = await solid(8, 12);
    await writeLosslessWebpFile(png, dest);
    const mtimeMs = statSync(dest).mtimeMs;
    const before = readFileSync(dest);
    await writeLosslessWebpFile(png, dest);
    expect(readFileSync(dest)).toEqual(before);
    expect(statSync(dest).mtimeMs).toBe(mtimeMs);
  });
});
