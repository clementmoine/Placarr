import { describe, expect, it } from "vitest";

import { buildPrintKey, isPrintKey, parsePrintKey } from "./printKey";

describe("buildPrintKey", () => {
  it("builds a key from what is printed on the card", () => {
    expect(buildPrintKey({ game: "lorcana", set: "9", number: "1" })).toBe(
      "lorcana:9-1",
    );
  });

  it("keeps the variant letter inside the collector number", () => {
    // Set 3 prints five different Dalmatian Puppies, all numbered 4.
    expect(buildPrintKey({ game: "lorcana", set: "3", number: "4a" })).toBe(
      "lorcana:3-4a",
    );
    expect(buildPrintKey({ game: "lorcana", set: "3", number: "4b" })).toBe(
      "lorcana:3-4b",
    );
  });

  it("keeps promos apart from the base card that shares their number", () => {
    // `20/204` and `20/P1` are both set 1 number 20, and different cards.
    expect(buildPrintKey({ game: "lorcana", set: "1", number: "20" })).toBe(
      "lorcana:1-20",
    );
    expect(
      buildPrintKey({
        game: "lorcana",
        set: "1",
        number: "20",
        grouping: "P1",
      }),
    ).toBe("lorcana:1-20-p1");
  });

  it("accepts non-numeric set codes", () => {
    expect(buildPrintKey({ game: "lorcana", set: "Q1", number: "12" })).toBe(
      "lorcana:q1-12",
    );
  });

  it("treats an absent grouping and an empty one alike", () => {
    const withNull = buildPrintKey({
      game: "lorcana",
      set: "9",
      number: "1",
      grouping: null,
    });
    const withEmpty = buildPrintKey({
      game: "lorcana",
      set: "9",
      number: "1",
      grouping: "  ",
    });
    expect(withNull).toBe("lorcana:9-1");
    expect(withEmpty).toBe("lorcana:9-1");
  });

  it("refuses a segment carrying a separator, which could not round-trip", () => {
    expect(
      buildPrintKey({ game: "lorcana", set: "9-1", number: "1" }),
    ).toBeNull();
    expect(
      buildPrintKey({ game: "lor:cana", set: "9", number: "1" }),
    ).toBeNull();
    expect(
      buildPrintKey({
        game: "lorcana",
        set: "9",
        number: "1",
        grouping: "P-1",
      }),
    ).toBeNull();
  });

  it("refuses missing segments rather than emitting a truncated key", () => {
    expect(buildPrintKey({ game: "lorcana", set: "", number: "1" })).toBeNull();
    expect(buildPrintKey({ game: "lorcana", set: "9", number: "" })).toBeNull();
    expect(buildPrintKey({ game: "", set: "9", number: "1" })).toBeNull();
  });
});

describe("parsePrintKey", () => {
  it("round-trips a base card", () => {
    expect(parsePrintKey("lorcana:9-1")).toEqual({
      game: "lorcana",
      set: "9",
      number: "1",
      grouping: null,
    });
  });

  it("round-trips a promo", () => {
    expect(parsePrintKey("lorcana:1-20-p1")).toEqual({
      game: "lorcana",
      set: "1",
      number: "20",
      grouping: "p1",
    });
  });

  it("accepts the key back in any case", () => {
    expect(parsePrintKey("LORCANA:Q1-12")).toEqual({
      game: "lorcana",
      set: "q1",
      number: "12",
      grouping: null,
    });
  });

  it("rejects what is not a print key", () => {
    expect(parsePrintKey("0045496420355")).toBeNull();
    expect(parsePrintKey("lorcana")).toBeNull();
    expect(parsePrintKey(":9-1")).toBeNull();
    expect(parsePrintKey("lorcana:9")).toBeNull();
    expect(parsePrintKey("lorcana:9-1-p1-extra")).toBeNull();
    expect(parsePrintKey("")).toBeNull();
    expect(parsePrintKey(null)).toBeNull();
  });

  it("rejects a key whose segments are empty", () => {
    expect(parsePrintKey("lorcana:-1")).toBeNull();
    expect(parsePrintKey("lorcana:9-")).toBeNull();
    expect(parsePrintKey("lorcana:9-1-")).toBeNull();
  });
});

describe("isPrintKey", () => {
  it("separates print keys from barcodes", () => {
    expect(isPrintKey("lorcana:9-1")).toBe(true);
    expect(isPrintKey("0045496420355")).toBe(false);
  });
});
