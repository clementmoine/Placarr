import sharp from "sharp";
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

import { trimLightImageMargins, cropImageIfNeeded } from "./imageTrim";

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

  it("keeps images without light margins unchanged", async () => {
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

describe("cropImageIfNeeded", () => {
  it("creates a _crop file only when cropping is detected and leaves original intact", async () => {
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const testImageName = "test-crop-temp.png";
    const testImagePath = path.join(uploadsDir, testImageName);
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

    fs.writeFileSync(testImagePath, input);

    try {
      const resultUrl = await cropImageIfNeeded(`/uploads/${testImageName}`, {
        minMarginPixels: 10,
      });
      expect(resultUrl).toBe(`/uploads/test-crop-temp_crop.png`);

      expect(fs.existsSync(testImagePath)).toBe(true);
      const croppedFilePath = path.join(uploadsDir, "test-crop-temp_crop.png");
      expect(fs.existsSync(croppedFilePath)).toBe(true);

      const croppedMetadata = await sharp(croppedFilePath).metadata();
      expect(croppedMetadata.width).toBe(70);
      expect(croppedMetadata.height).toBe(50);

      const testImageNameNoCrop = "test-nocrop-temp.png";
      const testImagePathNoCrop = path.join(uploadsDir, testImageNameNoCrop);
      fs.writeFileSync(testImagePathNoCrop, input);

      try {
        const resultUrlNoCrop = await cropImageIfNeeded(
          `/uploads/${testImageNameNoCrop}`,
          { minMarginPixels: 100 },
        );
        expect(resultUrlNoCrop).toBe(`/uploads/${testImageNameNoCrop}`);
        expect(fs.existsSync(testImagePathNoCrop)).toBe(true);
        expect(
          fs.existsSync(path.join(uploadsDir, "test-nocrop-temp_crop.png")),
        ).toBe(false);
      } finally {
        if (fs.existsSync(testImagePathNoCrop)) {
          fs.unlinkSync(testImagePathNoCrop);
        }
      }
    } finally {
      if (fs.existsSync(testImagePath)) fs.unlinkSync(testImagePath);
      const croppedFilePath = path.join(uploadsDir, "test-crop-temp_crop.png");
      if (fs.existsSync(croppedFilePath)) fs.unlinkSync(croppedFilePath);
    }
  });
});
