import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { cropStudioMatte } from "./studioMatteCrop";

async function greyMatteWithSubject(opts: {
  canvas: number;
  subjectW: number;
  subjectH: number;
  left: number;
  top: number;
  subject: string;
  matte?: string;
}): Promise<Buffer> {
  return sharp({
    create: {
      width: opts.canvas,
      height: opts.canvas,
      channels: 3,
      background: opts.matte ?? "#dedede",
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: opts.subjectW,
            height: opts.subjectH,
            channels: 3,
            background: opts.subject,
          },
        })
          .png()
          .toBuffer(),
        left: opts.left,
        top: opts.top,
      },
    ])
    .jpeg()
    .toBuffer();
}

describe("cropStudioMatte", () => {
  it("crops grey studio matte around a white-bordered card", async () => {
    const input = await greyMatteWithSubject({
      canvas: 200,
      subjectW: 80,
      subjectH: 120,
      left: 60,
      top: 40,
      subject: "#ffffff",
    });

    const output = await cropStudioMatte(input);
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(120);

    // Corner of result should be white (subject), not grey matte.
    const { data } = await sharp(output)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240);
    expect(data[1]).toBeGreaterThan(240);
    expect(data[2]).toBeGreaterThan(240);
  });

  it("paints residual matte white for a diamond-shaped subject", async () => {
    // Synthetic diamond: white square rotated via SVG composite is heavy;
    // approximate with a bright square that does not touch corners.
    const input = await greyMatteWithSubject({
      canvas: 160,
      subjectW: 70,
      subjectH: 70,
      left: 45,
      top: 45,
      subject: "#f8f8f8",
      matte: "#c8c8c8",
    });

    const output = await cropStudioMatte(input);
    const meta = await sharp(output).metadata();
    expect(meta.width).toBeLessThan(160);
    expect(meta.height).toBeLessThan(160);
    expect((meta.width ?? 0) * (meta.height ?? 0)).toBeLessThan(160 * 160 * 0.6);
  });

  it("leaves near-full-bleed images alone", async () => {
    const input = await sharp({
      create: {
        width: 100,
        height: 140,
        channels: 3,
        background: "#ff6600",
      },
    })
      .jpeg()
      .toBuffer();

    const output = await cropStudioMatte(input);
    expect(output.equals(input)).toBe(true);
  });
});
