import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  cropEbayDisney25CardSides,
  EBAY_DISNEY25_CARD_CROP,
  ebayDisney25VariationsFromMenuItemMap,
  isEbayDisney25CardNumber,
  parseEbayDisney25FixeezLabel,
  parseEbayDisney25VariationLabel,
} from "./ebayDisney25Faces";
import { buildLeclercFixeezLookup } from "./parseColekaLeclerc";

describe("ebayDisney25Faces mapping", () => {
  it("parses MSKU variation labels", () => {
    expect(parseEbayDisney25VariationLabel("001 | Lilo | 1")).toEqual({
      number: "001",
      name: "Lilo",
    });
    expect(parseEbayDisney25VariationLabel("104 | Riley")).toEqual({
      number: "104",
      name: "Riley",
    });
    expect(parseEbayDisney25VariationLabel("Album")).toBeNull();
  });

  it("builds rows from menuItemMap", () => {
    const rows = ebayDisney25VariationsFromMenuItemMap({
      "0": {
        valueName: "001 | Lilo | 1",
        matchingVariationIds: [536973391695],
      },
      "1": {
        displayName: "002 | Stitch | 2",
        matchingVariationIds: ["536973391696"],
      },
    });
    expect(rows).toEqual([
      {
        number: "001",
        name: "Lilo",
        variationId: "536973391695",
      },
      {
        number: "002",
        name: "Stitch",
        variationId: "536973391696",
      },
    ]);
  });

  it("maps Fixeez bare names via checklist lookup", () => {
    const lookup = buildLeclercFixeezLookup([
      { number: "f06", name: "Fixeez — Main de Mickey" },
      {
        number: "f12",
        name: "Fixeez — Stitch (avec un ananas)",
        aka: ["Stitch ananas", "Stitch (ananas)"],
      },
      { number: "f13", name: "Fixeez — Zootopia Police", aka: ["badge"] },
    ]);
    expect(parseEbayDisney25FixeezLabel("Main de Mickey", lookup)).toEqual({
      number: "f06",
      name: "Main de Mickey",
    });
    expect(
      parseEbayDisney25FixeezLabel(
        "Stitch (ananas) (En rupture de stock)",
        lookup,
      ),
    ).toEqual({ number: "f12", name: "Stitch (ananas)" });
    expect(parseEbayDisney25FixeezLabel("badge", lookup)).toEqual({
      number: "f13",
      name: "badge",
    });
    const rows = ebayDisney25VariationsFromMenuItemMap(
      {
        "5": {
          valueName: "Main de Mickey",
          matchingVariationIds: [536970657657],
        },
      },
      { fixeezLookup: lookup },
    );
    expect(rows).toEqual([
      {
        number: "f06",
        name: "Main de Mickey",
        variationId: "536970657657",
      },
    ]);
  });
});

describe("ebayDisney25 card side crop", () => {
  it("detects card vs Fixeez numbers", () => {
    expect(isEbayDisney25CardNumber("001")).toBe(true);
    expect(isEbayDisney25CardNumber("108")).toBe(true);
    expect(isEbayDisney25CardNumber("f06")).toBe(false);
  });

  it("crops fixed left/right margins, keeps full height", async () => {
    const input = await sharp({
      create: {
        width: 1600,
        height: 1600,
        channels: 3,
        background: "#cccccc",
      },
    })
      .jpeg()
      .toBuffer();

    const out = await cropEbayDisney25CardSides(input);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(
      1600 - EBAY_DISNEY25_CARD_CROP.left - EBAY_DISNEY25_CARD_CROP.right,
    );
    expect(meta.height).toBe(1600);
  });
});
