import { describe, expect, it } from "vitest";

import {
  expandPrintCandidatesByFinish,
  finishesOwnedByBlankVariant,
  normalizeVariantOptions,
  offersVariantChoice,
  resolveStoredVariant,
  variantUsesFoilMarketPrice,
} from "./variants";

describe("expandPrintCandidatesByFinish", () => {
  it("emits one row per finish so the picker can tag each option", () => {
    const rows = expandPrintCandidatesByFinish([
      {
        printKey: "pokemon:xy12-11",
        language: "fr",
        finishes: ["normal", "holo", "live-ph"],
        title: "Dracaufeu",
      },
    ]);
    expect(rows.map((row) => row.finish)).toEqual([
      "normal",
      "holo",
      "live-ph",
    ]);
    expect(rows.map((row) => row.rowKey)).toEqual([
      "pokemon:xy12-11|normal|fr",
      "pokemon:xy12-11|holo|fr",
      "pokemon:xy12-11|live-ph|fr",
    ]);
  });

  it("keeps a single row when the print has no finish list", () => {
    expect(
      expandPrintCandidatesByFinish([
        { printKey: "lorcana:1", finishes: [], title: "Elsa" },
      ]),
    ).toEqual([
      expect.objectContaining({
        printKey: "lorcana:1",
        finish: null,
        rowKey: "lorcana:1||",
      }),
    ]);
  });

  it("still expands a lone finish so the tile can show its tag", () => {
    expect(
      expandPrintCandidatesByFinish([
        { printKey: "p:1", finishes: ["holo"], language: "en" },
      ])[0],
    ).toMatchObject({ finish: "holo", rowKey: "p:1|holo|en" });
  });

  it("includes setCode in rowKey so multi-set finishes stay distinct", () => {
    expect(
      expandPrintCandidatesByFinish([
        {
          printKey: "naruto:ta-0074",
          finishes: ["normal", "holo"],
          language: "fr",
          setCode: "s2",
        },
        {
          printKey: "naruto:ta-0074",
          finishes: ["normal", "holo"],
          language: "fr",
          setCode: "s3",
        },
      ]).map((row) => row.rowKey),
    ).toEqual([
      "naruto:ta-0074|normal|fr|s2",
      "naruto:ta-0074|holo|fr|s2",
      "naruto:ta-0074|normal|fr|s3",
      "naruto:ta-0074|holo|fr|s3",
    ]);
  });
});

describe("normalizeVariantOptions", () => {
  it("keeps the provider's order", () => {
    expect(normalizeVariantOptions(["None", "Silver"])).toEqual([
      "None",
      "Silver",
    ]);
  });

  it("offers one choice when two providers spell a finish differently", () => {
    expect(normalizeVariantOptions(["Foil", "foil", "FOIL"])).toEqual(["Foil"]);
  });

  it("drops blanks rather than offering an empty choice", () => {
    expect(normalizeVariantOptions(["  ", "Silver", "", null])).toEqual([
      "Silver",
    ]);
  });

  it("survives missing options", () => {
    expect(normalizeVariantOptions(null)).toEqual([]);
    expect(normalizeVariantOptions(undefined)).toEqual([]);
    expect(normalizeVariantOptions([])).toEqual([]);
  });
});

describe("offersVariantChoice", () => {
  it("is false for a single option, which is not a choice", () => {
    // An Enchanted card exists only in Magma foil: asking says nothing.
    expect(offersVariantChoice(["Magma"])).toBe(false);
  });

  it("is true once there is something to pick between", () => {
    expect(offersVariantChoice(["None", "Silver"])).toBe(true);
  });

  it("is false when duplicates collapse to a single option", () => {
    expect(offersVariantChoice(["Foil", "foil"])).toBe(false);
  });

  it("is false without options", () => {
    expect(offersVariantChoice([])).toBe(false);
    expect(offersVariantChoice(null)).toBe(false);
  });
});

describe("resolveStoredVariant", () => {
  it("keeps a variant that is still offered", () => {
    expect(resolveStoredVariant("Silver", ["None", "Silver"])).toBe("Silver");
  });

  it("matches case-insensitively but answers with the declared spelling", () => {
    expect(resolveStoredVariant("silver", ["Silver"])).toBe("Silver");
  });

  it("drops a variant no longer offered", () => {
    // Guessing a replacement would quietly relabel someone's copy.
    expect(resolveStoredVariant("Silver", ["None"])).toBeNull();
  });

  it("drops everything when nothing is offered", () => {
    expect(resolveStoredVariant("Silver", [])).toBeNull();
    expect(resolveStoredVariant("Silver", null)).toBeNull();
  });

  it("treats blank as absent", () => {
    expect(resolveStoredVariant("  ", ["None"])).toBeNull();
    expect(resolveStoredVariant(null, ["None"])).toBeNull();
  });
});

describe("variantUsesFoilMarketPrice", () => {
  it("uses plainFinishes from the provider when available", () => {
    expect(variantUsesFoilMarketPrice("None", ["None"])).toBe(false);
    expect(variantUsesFoilMarketPrice("Silver", ["None"])).toBe(true);
  });

  it("falls back to common plain spellings without plainFinishes", () => {
    expect(variantUsesFoilMarketPrice("None")).toBe(false);
    expect(variantUsesFoilMarketPrice("nonfoil")).toBe(false);
    expect(variantUsesFoilMarketPrice("Silver")).toBe(true);
    expect(variantUsesFoilMarketPrice(null)).toBe(false);
  });
});

describe("finishesOwnedByBlankVariant", () => {
  it("maps unset copies to plain only", () => {
    expect(
      finishesOwnedByBlankVariant(["None", "Silver"], ["None"]),
    ).toEqual(["None"]);
    expect(finishesOwnedByBlankVariant(["Silver"])).toEqual(["Silver"]);
    expect(finishesOwnedByBlankVariant(["None", "Silver"])).toEqual(["None"]);
    expect(finishesOwnedByBlankVariant([])).toEqual([]);
  });
});
