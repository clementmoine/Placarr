import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { cutImadokiSheet } from "./imadokiSheets";
import type { ImadokiSheet } from "./parseImadokiSheets";

async function sheetWithCenteredCard(opts: {
  sheetW: number;
  sheetH: number;
  cardW: number;
  cardH: number;
  margin: number;
  /** Scan bed grey — default pure white. */
  background?: string;
}): Promise<Buffer> {
  const { sheetW, sheetH, cardW, cardH, margin } = opts;
  const background = opts.background ?? "#ffffff";
  const left = margin;
  const top = margin;
  return sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 3,
      background,
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: cardW,
            height: cardH,
            channels: 3,
            background: "#f97316",
          },
        })
          .png()
          .toBuffer(),
        left,
        top,
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

describe("cutImadokiSheet", () => {
  it("recadre les marges blanches internes après découpe de grille", async () => {
    const sheet: ImadokiSheet = {
      file: "synthetic.jpg",
      columns: 1,
      rows: 1,
      gridMode: "equal",
      slots: [{ setCode: "nr", number: "0001" }],
    };
    const bytes = await sheetWithCenteredCard({
      sheetW: 300,
      sheetH: 400,
      cardW: 180,
      cardH: 260,
      margin: 40,
    });

    const { cuts } = await cutImadokiSheet(bytes, sheet);

    expect(cuts).toHaveLength(1);
    const meta = await sharp(cuts[0]!.buffer).metadata();
    expect(meta.width).toBeLessThan(300);
    expect(meta.height).toBeLessThan(400);
    expect(meta.width).toBeGreaterThanOrEqual(170);
    expect(meta.height).toBeGreaterThanOrEqual(250);
  });

  it("recadre un fond gris clair type scan Imadoki", async () => {
    const sheet: ImadokiSheet = {
      file: "synthetic-grey.jpg",
      columns: 1,
      rows: 1,
      gridMode: "equal",
      slots: [{ setCode: "nr", number: "0002" }],
    };
    const bytes = await sheetWithCenteredCard({
      sheetW: 300,
      sheetH: 400,
      cardW: 180,
      cardH: 260,
      margin: 40,
      background: "#ededed",
    });

    const { cuts } = await cutImadokiSheet(bytes, sheet);

    expect(cuts).toHaveLength(1);
    const meta = await sharp(cuts[0]!.buffer).metadata();
    expect(meta.width).toBeLessThan(220);
    expect(meta.height).toBeLessThan(320);
  });
});
