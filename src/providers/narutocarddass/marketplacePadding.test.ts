import { describe, expect, it } from "vitest";

import { isMarketplacePaddedImage } from "./marketplacePadding";

async function makePadded(): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  // Le composite Mercari Shops : photo centrée sur fond menthe uniforme.
  return sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 188, g: 208, b: 196 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 200,
            height: 280,
            channels: 3,
            background: { r: 40, g: 90, b: 160 },
          },
        },
        left: 100,
        top: 60,
      },
    ])
    .jpeg()
    .toBuffer();
}

async function makeFullFrameCard(): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  // Un scan qui remplit le cadre, bords compris (même verdâtre).
  const noise = Buffer.alloc(400 * 560 * 3);
  for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 7) % 256;
  return sharp(noise, {
    raw: { width: 400, height: 560, channels: 3 },
  })
    .jpeg()
    .toBuffer();
}

describe("isMarketplacePaddedImage", () => {
  it("flags the mint marketing composite, not a full-frame scan", async () => {
    expect(await isMarketplacePaddedImage(await makePadded())).toBe(true);
    expect(await isMarketplacePaddedImage(await makeFullFrameCard())).toBe(
      false,
    );
  });
});
