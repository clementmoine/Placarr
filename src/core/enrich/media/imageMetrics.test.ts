import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { measureDisplayImageDimensions } from "./imageMetrics";

describe("measureDisplayImageDimensions", () => {
  it("uses trimmed content size for a square canvas with side padding", async () => {
    // Marketplace-style 500×500 square whose art is a portrait poster with
    // neutral side bars (Chasse / Nightmare Before Christmas case).
    const input = await sharp({
      create: {
        width: 500,
        height: 500,
        channels: 3,
        background: "#f5f5f5",
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 347,
              height: 500,
              channels: 3,
              background: "#1a1a2e",
            },
          })
            .png()
            .toBuffer(),
          left: 77,
          top: 0,
        },
      ])
      .png()
      .toBuffer();

    const dims = await measureDisplayImageDimensions(input);
    expect(dims).toEqual({ width: 347, height: 500 });
  });

  it("keeps full canvas size when there is no neutral margin to trim", async () => {
    const input = await sharp({
      create: {
        width: 800,
        height: 800,
        channels: 3,
        background: "#224488",
      },
    })
      .png()
      .toBuffer();

    const dims = await measureDisplayImageDimensions(input);
    expect(dims).toEqual({ width: 800, height: 800 });
  });
});
