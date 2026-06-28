import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  coverRoleIndicates3d,
  coverSourceHintsIndicate2d,
  coverSourceSupportsRaster3dDetection,
  detectLikely3dCoverFromBuffer,
  detectFlatDigitalCoverFromBuffer,
  inferCover3dRoleFromHints,
  resolveCoverAttachmentRole,
} from "./coverPerspective";

async function flatCoverOnWhite(): Promise<Buffer> {
  return sharp({
    create: { width: 500, height: 700, channels: 3, background: "#ffffff" },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 360, height: 520, channels: 3, background: "#2563eb" },
        })
          .png()
          .toBuffer(),
        left: 70,
        top: 90,
      },
    ])
    .png()
    .toBuffer();
}

async function perspectiveCoverOnBlack(): Promise<Buffer> {
  const width = 700;
  const height = 700;
  const channels = 4;
  const data = Buffer.alloc(width * height * channels, 0);

  const fillTrapezoid = (
    topLeft: number,
    topRight: number,
    bottomRight: number,
    bottomLeft: number,
    yStart: number,
    yEnd: number,
    color: [number, number, number],
  ) => {
    for (let y = yStart; y <= yEnd; y += 1) {
      const t = (y - yStart) / Math.max(1, yEnd - yStart);
      const left = Math.round(topLeft + (bottomLeft - topLeft) * t);
      const right = Math.round(topRight + (bottomRight - topRight) * t);
      for (let x = left; x <= right; x += 1) {
        const offset = (y * width + x) * channels;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = 255;
      }
    }
  };

  fillTrapezoid(120, 580, 520, 180, 80, 620, [249, 115, 22]);

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/** Edge-to-edge flat portrait cover (typical PriceCharting 2D scan). */
async function fullBleedFlatPortraitCover(): Promise<Buffer> {
  const width = 660;
  const height = 828;
  const channels = 4;
  const data = Buffer.alloc(width * height * channels, 0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      data[offset] = 30 + Math.floor((x / width) * 40);
      data[offset + 1] = 90 + Math.floor((y / height) * 50);
      data[offset + 2] = 170;
      data[offset + 3] = 255;
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/** Landscape key art — never a physical box packshot. */
async function landscapeArtwork(): Promise<Buffer> {
  return sharp({
    create: { width: 1920, height: 1080, channels: 3, background: "#1e3a5f" },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 900, height: 500, channels: 3, background: "#22c55e" },
        })
          .png()
          .toBuffer(),
        left: 510,
        top: 290,
      },
    ])
    .jpeg()
    .toBuffer();
}

/** PS5-style packshot: neutral margin + blue spine + inset trapezoid face. */
async function packshotWithVisibleSpine(): Promise<Buffer> {
  const width = 520;
  const height = 700;
  const channels = 4;
  const data = Buffer.alloc(width * height * channels, 255);

  const setPixel = (x: number, y: number, color: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (y * width + x) * channels;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = 255;
  };

  for (let y = 80; y < 620; y += 1) {
    for (let x = 42; x < 74; x += 1) {
      setPixel(x, y, [55, 95, 175]);
    }
  }

  const fillTrapezoid = (
    topLeft: number,
    topRight: number,
    bottomRight: number,
    bottomLeft: number,
    yStart: number,
    yEnd: number,
    color: [number, number, number],
  ) => {
    for (let y = yStart; y <= yEnd; y += 1) {
      const t = (y - yStart) / Math.max(1, yEnd - yStart);
      const left = Math.round(topLeft + (bottomLeft - topLeft) * t);
      const right = Math.round(topRight + (bottomRight - topRight) * t);
      for (let x = left; x <= right; x += 1) {
        setPixel(x, y, color);
      }
    }
  };

  fillTrapezoid(88, 430, 390, 108, 90, 610, [20, 150, 120]);

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/** Flat full-bleed cover with a small rating badge in a top corner (ESRB-style). */
async function flatCoverWithCornerBadge(): Promise<Buffer> {
  const width = 600;
  const height = 800;
  const channels = 4;
  const data = Buffer.alloc(width * height * channels, 0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      data[offset] = 35;
      data[offset + 1] = 70;
      data[offset + 2] = 140;
      data[offset + 3] = 255;
    }
  }

  for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.16); y += 1) {
    for (let x = Math.floor(width * 0.84); x < Math.floor(width * 0.97); x += 1) {
      const offset = (y * width + x) * channels;
      data[offset] = 240;
      data[offset + 1] = 240;
      data[offset + 2] = 240;
      data[offset + 3] = 255;
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

describe("coverPerspective", () => {
  it("does not treat ChocoBonPlan visuel-produit as 3D (often flat scans)", () => {
    expect(
      coverSourceHintsIndicate2d(
        "https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-produit.png",
      ),
    ).toBe(true);
    expect(
      inferCover3dRoleFromHints({
        url: "https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-produit.png",
        source: "chocobonplan",
        role: "fr",
      }),
    ).toBeNull();
  });

  it("tags explicit box-3d hints as 3d", () => {
    expect(
      inferCover3dRoleFromHints({
        url: "https://example.com/covers/game-box-3d-eu.png",
        role: "eu",
      }),
    ).toBe("3d-eu");
  });

  it("keeps flat retailer scans as non-3d hints", () => {
    expect(
      coverSourceHintsIndicate2d(
        "https://chocobonplan.com/wp-content/uploads/2020/01/bon-plan-tekken-7-ps4.png",
      ),
    ).toBe(true);
    expect(
      inferCover3dRoleFromHints({
        url: "https://chocobonplan.com/wp-content/uploads/2020/01/bon-plan-tekken-7-ps4.png",
        source: "chocobonplan",
        role: "fr",
      }),
    ).toBeNull();
  });

  it("recognizes existing 3d roles", () => {
    expect(coverRoleIndicates3d("3d-fr")).toBe(true);
    expect(coverRoleIndicates3d("fr")).toBe(false);
  });

  it("does not infer 3D from raster geometry at storage time", () => {
    expect(coverSourceSupportsRaster3dDetection("pricecharting")).toBe(false);
    expect(coverSourceSupportsRaster3dDetection("picclick")).toBe(false);
    expect(coverSourceSupportsRaster3dDetection("rawg")).toBe(false);
  });

  it("detects a perspective packshot from raster geometry", async () => {
    const flat = await detectLikely3dCoverFromBuffer(await flatCoverOnWhite());
    const perspective = await detectLikely3dCoverFromBuffer(
      await perspectiveCoverOnBlack(),
    );

    expect(flat.likely3d).toBe(false);
    expect(perspective.likely3d).toBe(true);
    expect(perspective.confidence).toBeGreaterThan(0.45);
  });

  it("does not flag a full-bleed flat portrait cover as 3D", async () => {
    const detection = await detectLikely3dCoverFromBuffer(
      await fullBleedFlatPortraitCover(),
    );
    expect(detection.likely3d).toBe(false);
  });

  it("does not flag landscape artwork as 3D", async () => {
    const detection = await detectLikely3dCoverFromBuffer(
      await landscapeArtwork(),
    );
    expect(detection.likely3d).toBe(false);
  });

  it("detects a packshot with a visible spine strip", async () => {
    const detection = await detectLikely3dCoverFromBuffer(
      await perspectiveCoverOnBlack(),
    );
    expect(detection.likely3d).toBe(true);
    expect(detection.confidence).toBeGreaterThan(0.45);
  });

  it("keeps IGDB/RAWG covers flat even when raster heuristics would fire", async () => {
    const buffer = await perspectiveCoverOnBlack();

    await expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "wor",
        source: "rawg",
        imageBuffer: buffer,
      }),
    ).resolves.toBe("wor");

    await expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "wor",
        source: "igdb",
        imageBuffer: buffer,
      }),
    ).resolves.toBe("wor");
  });

  it("does not promote PriceCharting covers to 3d from raster geometry", async () => {
    await expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "eu",
        source: "pricecharting",
        imageBuffer: await perspectiveCoverOnBlack(),
      }),
    ).resolves.toBe("eu");
  });

  it("does not flag a flat full-bleed scan with only a corner rating badge as 3D", async () => {
    const detection = await detectLikely3dCoverFromBuffer(
      await flatCoverWithCornerBadge(),
    );
    expect(detection.likely3d).toBe(false);
  });

  it("keeps PriceCharting flat full-bleed scans as 2D", async () => {
    await expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "eu",
        source: "pricecharting",
        imageBuffer: await fullBleedFlatPortraitCover(),
      }),
    ).resolves.toBe("eu");
  });

  it("detects a subtle PS5 packshot fixture when present on disk", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const samplePath = path.join(
      process.cwd(),
      "public/uploads/44db1795f29513547c7cc995460423f3.jpg",
    );
    if (!fs.existsSync(samplePath)) return;

    const buffer = fs.readFileSync(samplePath);
    const detection = await detectLikely3dCoverFromBuffer(buffer);
    expect(detection.likely3d).toBe(true);
    expect(detection.confidence).toBeGreaterThan(0.68);

    await expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "eu",
        source: "pricecharting",
        imageBuffer: buffer,
      }),
    ).resolves.toBe("eu");
  });

  it("does not flag a flat PriceCharting scan with a corner badge on disk", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const samplePath = path.join(
      process.cwd(),
      "public/uploads/d824e561359a8cd81ab75e628b93a54e.jpg",
    );
    if (!fs.existsSync(samplePath)) return;

    const detection = await detectLikely3dCoverFromBuffer(
      fs.readFileSync(samplePath),
    );
    expect(detection.likely3d).toBe(false);
  });

  it("detects an inset PicClick packshot with a saturated spine on disk", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const samplePath = path.join(
      process.cwd(),
      "public/uploads/287db2c97d39271142fad1a38653c92c.webp",
    );
    if (!fs.existsSync(samplePath)) return;

    const buffer = fs.readFileSync(samplePath);
    const detection = await detectLikely3dCoverFromBuffer(buffer);
    expect(detection.likely3d).toBe(true);
    expect(detection.confidence).toBeGreaterThan(0.68);

    await expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "wor",
        source: "picclick",
        imageBuffer: buffer,
      }),
    ).resolves.toBe("wor");
  });

  it("detects a PicClick orthographic digital render as flat 2D on disk", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const samplePath = path.join(
      process.cwd(),
      "public/uploads/5450d7f2efccdfb935b752dc39fdfcb2.webp",
    );
    if (!fs.existsSync(samplePath)) return;

    const buffer = fs.readFileSync(samplePath);
    expect(await detectFlatDigitalCoverFromBuffer(buffer)).toBe(true);
    expect((await detectLikely3dCoverFromBuffer(buffer)).likely3d).toBe(false);

    await expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "wor",
        source: "picclick",
        imageBuffer: buffer,
      }),
    ).resolves.toBe("wor");
  });

  it("rejects a flat full-bleed scan mistaken for 3d by a thin spine strip", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const samplePath = path.join(
      process.cwd(),
      "public/uploads/64d245334dd5fa9487f0216e712614bf.jpg",
    );
    if (!fs.existsSync(samplePath)) return;

    const buffer = fs.readFileSync(samplePath);
    const detection = await detectLikely3dCoverFromBuffer(buffer);
    expect(detection.likely3d).toBe(false);

    await expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "eu",
        source: "pricecharting",
        imageBuffer: buffer,
      }),
    ).resolves.toBe("eu");
  });

  it("keeps ChocoBonPlan visuel-produit flat despite inset raster signals", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const samplePath = path.join(
      process.cwd(),
      "public/uploads/42b5817bb247c7289b839eb6b9a60efa.png",
    );
    if (!fs.existsSync(samplePath)) return;

    const buffer = fs.readFileSync(samplePath);
    const detection = await detectLikely3dCoverFromBuffer(buffer);
    expect(detection.likely3d).toBe(true);

    await expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "fr",
        source: "chocobonplan",
        url: "https://chocobonplan.com/wp-content/uploads/2025/04/alan-wake-edition-deluxe-ps5-visuel-produit.png",
        title: "alan wake edition deluxe ps5 visuel produit",
        imageBuffer: buffer,
      }),
    ).resolves.toBe("fr");

    await expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "3d-fr",
        source: "chocobonplan",
        url: "https://chocobonplan.com/wp-content/uploads/2025/04/alan-wake-edition-deluxe-ps5-visuel-produit.png",
        title: "alan wake edition deluxe ps5 visuel produit",
        imageBuffer: buffer,
      }),
    ).resolves.toBe("fr");
  });

  it("keeps ScreenScraper box-3D roles authoritative", async () => {
    await expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "3d-eu",
        source: "screenscraper",
        url: "https://www.screenscraper.fr/images/videogames/box-3D(eu).jpg",
      }),
    ).resolves.toBe("3d-eu");
  });

  it("demotes raster-inferred PicClick 3d-marketplace to marketplace", async () => {
    await expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "3d-marketplace",
        source: "picclick",
        title: "Alan Wake 2 Deluxe Edition",
      }),
    ).resolves.toBe("marketplace");
  });

  it("promotes explicit box-3d URL hints", async () => {
    await expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "eu",
        source: "pricecharting",
        url: "https://example.com/game-box-3d-eu.jpg",
      }),
    ).resolves.toBe("3d-eu");
  });
});
