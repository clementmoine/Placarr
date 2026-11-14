import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { cropEbayDisney25CardSides } from "./ebayDisney25Faces";
import {
  EBAY_DISNEY26_CARD_CROP,
  parseEbayDisney26GroupNumber,
} from "./ebayDisney26Faces";

describe("parseEbayDisney26GroupNumber", () => {
  it.each([
    ["1", "001"],
    ["58", "058"],
    ["108", "108"],
  ] as const)("album %s → %s", (raw, number) => {
    expect(parseEbayDisney26GroupNumber(raw, "album")).toEqual({
      number,
      name: "",
    });
  });

  it.each([
    ["2 - Buzz L'Éclair", "f02", "Buzz L'Éclair"],
    ["24 - Mickey", "f24", "Mickey"],
  ] as const)("fixeez %s → %s", (raw, number, name) => {
    expect(parseEbayDisney26GroupNumber(raw, "fixeez")).toEqual({
      number,
      name,
    });
  });

  it("rejects out-of-range album / fixeez", () => {
    expect(parseEbayDisney26GroupNumber("0", "album")).toBeNull();
    expect(parseEbayDisney26GroupNumber("109", "album")).toBeNull();
    expect(parseEbayDisney26GroupNumber("25 - X", "fixeez")).toBeNull();
  });
});

describe("ebayDisney26 card side crop", () => {
  it("uses milder L/R than Disney25 on 1200-wide studio shots", async () => {
    const input = await sharp({
      create: {
        width: 1200,
        height: 1600,
        channels: 3,
        background: "#eeeeee",
      },
    })
      .jpeg()
      .toBuffer();

    const out = await cropEbayDisney25CardSides(input, EBAY_DISNEY26_CARD_CROP);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(
      1200 - EBAY_DISNEY26_CARD_CROP.left - EBAY_DISNEY26_CARD_CROP.right,
    );
    expect(meta.height).toBe(1600);
    expect(meta.width).toBeGreaterThan(900);
  });
});
