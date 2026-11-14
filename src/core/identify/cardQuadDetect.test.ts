import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  detectCardQuad,
  dewarpCardFace,
  extremePointQuad,
  insetQuad,
} from "./cardQuadDetect";

describe("insetQuad", () => {
  it("moves corners toward the center", () => {
    const inset = insetQuad(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 200 },
        { x: 0, y: 200 },
      ],
      0.1,
    );
    expect(inset[0]!.x).toBeGreaterThan(0);
    expect(inset[0]!.y).toBeGreaterThan(0);
    expect(inset[2]!.x).toBeLessThan(100);
    expect(inset[2]!.y).toBeLessThan(200);
  });
});

describe("extremePointQuad", () => {
  it("recovers corners of a filled axis-aligned rectangle", () => {
    const width = 40;
    const height = 60;
    const pixels: number[] = [];
    for (let y = 10; y <= 50; y++) {
      for (let x = 8; x <= 28; x++) {
        pixels.push(y * width + x);
      }
    }
    const quad = extremePointQuad(pixels, width);
    expect(quad).not.toBeNull();
    const [tl, tr, br, bl] = quad!;
    expect(tl).toEqual({ x: 8, y: 10 });
    expect(tr).toEqual({ x: 28, y: 10 });
    expect(br).toEqual({ x: 28, y: 50 });
    expect(bl).toEqual({ x: 8, y: 50 });
  });
});

describe("detectCardQuad / dewarpCardFace", () => {
  it("finds a bright card-shaped rectangle on a dark table", async () => {
    const width = 400;
    const height = 300;
    // Dark background + light portrait card (≈63/88) centered.
    const cardW = 126;
    const cardH = 176;
    const left = Math.round((width - cardW) / 2);
    const top = Math.round((height - cardH) / 2);

    const bg = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 32, g: 32, b: 36 },
      },
    })
      .png()
      .toBuffer();

    const card = await sharp({
      create: {
        width: cardW,
        height: cardH,
        channels: 3,
        background: { r: 220, g: 210, b: 190 },
      },
    })
      .png()
      .toBuffer();

    const composed = await sharp(bg)
      .composite([{ input: card, left, top }])
      .jpeg()
      .toBuffer();

    const hit = await detectCardQuad(composed);
    expect(hit).not.toBeNull();
    expect(hit!.coverage).toBeGreaterThan(0.08);
    expect(hit!.coverage).toBeLessThan(0.7);

    const [tl, tr, br, bl] = hit!.quad.points;
    // Corners should land near the painted card (tolerance for edge dilation).
    expect(tl.x).toBeGreaterThan(left - 20);
    expect(tl.x).toBeLessThan(left + 30);
    expect(tr.x).toBeGreaterThan(left + cardW - 30);
    expect(br.y).toBeGreaterThan(top + cardH - 30);
    expect(bl.x).toBeLessThan(left + 30);

    const dewarped = await dewarpCardFace(composed);
    expect(dewarped).not.toBeNull();
    const meta = await sharp(dewarped!.jpeg).metadata();
    expect(meta.width).toBeGreaterThan(100);
    expect(meta.height).toBeGreaterThan(140);
  });

  it("abstains on a flat empty frame (honest miss)", async () => {
    const empty = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 3,
        background: { r: 90, g: 90, b: 90 },
      },
    })
      .jpeg()
      .toBuffer();
    expect(await detectCardQuad(empty)).toBeNull();
  });
});
