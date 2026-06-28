import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { detectListingPhotoFromBuffer } from "./coverListingPhoto";
import { detectFlatDigitalCoverFromBuffer } from "./coverPerspective";

describe("coverListingPhoto", () => {
  it("flags a smartphone listing photo on a wooden surface", async () => {
    const samplePath = path.join(
      process.cwd(),
      "public/uploads/76b00a92c188c1677e95a601525ed371.webp",
    );
    if (!fs.existsSync(samplePath)) return;

    const buffer = fs.readFileSync(samplePath);
    expect(await detectListingPhotoFromBuffer(buffer)).toBe(true);
    expect(await detectFlatDigitalCoverFromBuffer(buffer)).toBe(false);
  });

  it("does not flag a clean PicClick digital render", async () => {
    const samplePath = path.join(
      process.cwd(),
      "public/uploads/5450d7f2efccdfb935b752dc39fdfcb2.webp",
    );
    if (!fs.existsSync(samplePath)) return;

    const buffer = fs.readFileSync(samplePath);
    expect(await detectListingPhotoFromBuffer(buffer)).toBe(false);
    expect(await detectFlatDigitalCoverFromBuffer(buffer)).toBe(true);
  });

  it("does not flag an inset packshot on a neutral background", async () => {
    const samplePath = path.join(
      process.cwd(),
      "public/uploads/287db2c97d39271142fad1a38653c92c.webp",
    );
    if (!fs.existsSync(samplePath)) return;

    const buffer = fs.readFileSync(samplePath);
    expect(await detectListingPhotoFromBuffer(buffer)).toBe(false);
  });

  it("does not flag a full-bleed IGDB cover art asset", async () => {
    const samplePath = path.join(
      process.cwd(),
      "public/uploads/61663feb7d15abcfe277649baff13713.jpg",
    );
    if (!fs.existsSync(samplePath)) return;

    const buffer = fs.readFileSync(samplePath);
    expect(await detectListingPhotoFromBuffer(buffer)).toBe(false);
  });
});
