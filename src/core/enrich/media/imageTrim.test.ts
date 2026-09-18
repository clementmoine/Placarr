import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { suggestCropBox, trimLightImageMargins } from "./imageTrim";

describe("trimLightImageMargins", () => {
  it("crops light margins around raster images", async () => {
    const input = await sharp({
      create: {
        width: 120,
        height: 100,
        channels: 3,
        background: "#ffffff",
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 70,
              height: 50,
              channels: 3,
              background: "#f97316",
            },
          })
            .png()
            .toBuffer(),
          left: 25,
          top: 20,
        },
      ])
      .png()
      .toBuffer();

    const output = await trimLightImageMargins(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(70);
    expect(metadata.height).toBe(50);
  });

  it("crops grey off-white scan beds with a lower luminance threshold", async () => {
    const input = await sharp({
      create: {
        width: 120,
        height: 100,
        channels: 3,
        background: "#ededed",
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 70,
              height: 50,
              channels: 3,
              background: "#f97316",
            },
          })
            .png()
            .toBuffer(),
          left: 25,
          top: 20,
        },
      ])
      .png()
      .toBuffer();

    const unchanged = await trimLightImageMargins(input);
    expect(unchanged).toBe(input);

    const output = await trimLightImageMargins(input, {
      lightLuminanceThreshold: 220,
    });
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(70);
    expect(metadata.height).toBe(50);
  });

  it("keeps full-bleed dark images without neutral margins unchanged", async () => {
    const input = await sharp({
      create: {
        width: 80,
        height: 60,
        channels: 3,
        background: "#0f172a",
      },
    })
      .png()
      .toBuffer();

    const output = await trimLightImageMargins(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(80);
    expect(metadata.height).toBe(60);
  });

  it("crops dark margins around raster images", async () => {
    const input = await sharp({
      create: {
        width: 120,
        height: 100,
        channels: 3,
        background: "#000000",
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 70,
              height: 50,
              channels: 3,
              background: "#f97316",
            },
          })
            .png()
            .toBuffer(),
          left: 25,
          top: 20,
        },
      ])
      .png()
      .toBuffer();

    const output = await trimLightImageMargins(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(70);
    expect(metadata.height).toBe(50);
  });

  it("respects minMarginPixels option", async () => {
    const input = await sharp({
      create: {
        width: 120,
        height: 100,
        channels: 3,
        background: "#ffffff",
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 100,
              height: 80,
              channels: 3,
              background: "#f97316",
            },
          })
            .png()
            .toBuffer(),
          left: 10,
          top: 10,
        },
      ])
      .png()
      .toBuffer();

    const outputNoCrop = await trimLightImageMargins(input, {
      minMarginPixels: 30,
    });
    expect(outputNoCrop).toBe(input);

    const outputCrop = await trimLightImageMargins(input, {
      minMarginPixels: 15,
    });
    const metadata = await sharp(outputCrop).metadata();
    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(80);
  });
});

describe("suggestCropBox", () => {
  it("reports the rectangle to keep instead of cropping on its own", async () => {
    const input = await sharp({
      create: { width: 120, height: 100, channels: 3, background: "#ffffff" },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 70,
              height: 50,
              channels: 3,
              background: "#f97316",
            },
          })
            .png()
            .toBuffer(),
          left: 25,
          top: 20,
        },
      ])
      .png()
      .toBuffer();

    const box = await suggestCropBox(input);

    expect(box).toEqual({
      left: 25,
      top: 20,
      width: 70,
      height: 50,
      imageWidth: 120,
      imageHeight: 100,
    });
  });

  it("suggests nothing when the margins are thinner than asked", async () => {
    const input = await sharp({
      create: { width: 120, height: 100, channels: 3, background: "#ffffff" },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 118,
              height: 98,
              channels: 3,
              background: "#f97316",
            },
          })
            .png()
            .toBuffer(),
          left: 1,
          top: 1,
        },
      ])
      .png()
      .toBuffer();

    expect(await suggestCropBox(input, { minMarginPixels: 30 })).toBeNull();
  });

  it("suggests nothing on an image with no neutral margin at all", async () => {
    const input = await sharp({
      create: { width: 80, height: 60, channels: 3, background: "#f97316" },
    })
      .png()
      .toBuffer();

    expect(await suggestCropBox(input)).toBeNull();
  });
});
