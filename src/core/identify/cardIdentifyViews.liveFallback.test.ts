import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/core/identify/cardQuadDetect", () => ({
  dewarpCardFace: async () => null,
}));

import { buildCardIdentifyViews } from "./cardIdentifyViews";

describe("buildCardIdentifyViews live AABB fallback", () => {
  it("still yields a card_live view when dewarp abstains on a usable frame", async () => {
    // High-contrast checkerboard — usable luma variance, quad mocked off.
    const size = 64;
    const raw = Buffer.alloc(size * size * 3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 3;
        const v = ((x >> 3) + (y >> 3)) % 2 === 0 ? 40 : 200;
        raw[i] = v;
        raw[i + 1] = v;
        raw[i + 2] = v;
      }
    }
    const buf = await sharp(raw, {
      raw: { width: size, height: size, channels: 3 },
    })
      .resize(480, 640, { kernel: "nearest" })
      .jpeg()
      .toBuffer();

    const built = await buildCardIdentifyViews(buf, {
      allowUndetectedFallbacks: false,
    });
    expect(built.abstain).toBeUndefined();
    expect(built.views.map((v) => v.id)).toEqual(["card_live"]);
  });
});
