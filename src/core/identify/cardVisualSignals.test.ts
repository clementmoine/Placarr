import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  aHashFromBuffer,
  colorGridDistance,
  colorGridFromBuffer,
  extractCardVisualSignals,
  matchCardVisualSignals,
  signalsAgree,
} from "./cardVisualSignals";
import type { CardVisualIndexFile } from "./cardVisualIndex";

describe("cardVisualSignals", () => {
  it("builds aHash and color grid from a patterned image", async () => {
    const png = await sharp({
      create: {
        width: 120,
        height: 160,
        channels: 3,
        background: { r: 200, g: 40, b: 40 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 60,
              height: 80,
              channels: 3,
              background: { r: 20, g: 180, b: 60 },
            },
          })
            .png()
            .toBuffer(),
          left: 30,
          top: 20,
        },
      ])
      .jpeg()
      .toBuffer();

    const aHash = await aHashFromBuffer(png, { artBand: false });
    const color = await colorGridFromBuffer(png, { artBand: false });
    expect(aHash).toHaveLength(64);
    expect(color).toHaveLength(6 * 6 * 3 * 2);

    const again = await extractCardVisualSignals(png, { artBand: false });
    expect(again?.aHash).toBe(aHash);
    expect(colorGridDistance(again!.color, color!)).toBe(0);
  });

  it("ranks the identical entry first and reports multi-signal votes", async () => {
    const face = await sharp({
      create: {
        width: 200,
        height: 280,
        channels: 3,
        background: { r: 30, g: 90, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();
    const signals = await extractCardVisualSignals(face, { artBand: false });
    expect(signals).not.toBeNull();

    const other = await extractCardVisualSignals(
      await sharp({
        create: {
          width: 200,
          height: 280,
          channels: 3,
          background: { r: 220, g: 180, b: 20 },
        },
      })
        .jpeg()
        .toBuffer(),
      { artBand: false },
    );

    const index: CardVisualIndexFile = {
      version: 2,
      packId: "lorcana",
      lang: "fr",
      builtAt: "2026-10-30T00:00:00.000Z",
      entries: [
        {
          printKey: "lorcana:1-1",
          lang: "fr",
          set: "1",
          card: "1",
          artRel: "cards/fr/1/1/art.jpg",
          hash: signals!.dHash,
          aHash: signals!.aHash,
          color: signals!.color,
        },
        {
          printKey: "lorcana:1-2",
          lang: "fr",
          set: "1",
          card: "2",
          artRel: "cards/fr/1/2/art.jpg",
          hash: other!.dHash,
          aHash: other!.aHash,
          color: other!.color,
        },
      ],
    };

    const hits = matchCardVisualSignals(signals!, index, { limit: 2 });
    expect(hits[0]?.printKey).toBe("lorcana:1-1");
    expect(hits[0]?.votes).toBeGreaterThanOrEqual(2);
    expect(signalsAgree(signals!, index.entries[0]!)).toBe(true);
    // Different solid colors can still share a weak aHash; color must diverge.
    expect(
      colorGridDistance(signals!.color, index.entries[1]!.color!),
    ).toBeGreaterThan(40);
  });
});
