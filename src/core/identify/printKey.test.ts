import { afterEach, describe, expect, it } from "vitest";

import {
  buildPrintKey,
  isGameUniqueCollectorNumber,
  isPrintKey,
  parsePrintKey,
  printCollectableKey,
  comparePrintKeys,
  comparePrintSetCodes,
  registerPrintKeyCompare,
  unregisterPrintKeyCompare,
} from "./printKey";

describe("buildPrintKey", () => {
  it("accepts Unown punctuation collector numbers", () => {
    expect(buildPrintKey({ game: "pokemon", set: "exu", number: "!" })).toBe(
      "pokemon:exu-!",
    );
    expect(buildPrintKey({ game: "pokemon", set: "exu", number: "?" })).toBe(
      "pokemon:exu-?",
    );
    expect(parsePrintKey("pokemon:exu-?")).toEqual({
      game: "pokemon",
      set: "exu",
      number: "?",
      grouping: null,
    });
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

  it("accepts dotted TCGdex set codes", () => {
    expect(
      buildPrintKey({ game: "pokemon", set: "sv03.5", number: "006" }),
    ).toBe("pokemon:sv03.5-006");
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

describe("comparePrintSetCodes", () => {
  it("orders numeric sets by release number", () => {
    expect(comparePrintSetCodes("1", "2")).toBeLessThan(0);
    expect(comparePrintSetCodes("2", "11")).toBeLessThan(0);
    expect(comparePrintSetCodes("11", "2")).toBeGreaterThan(0);
  });

  it("keeps lettered sets after numeric ones", () => {
    expect(comparePrintSetCodes("9", "q1")).toBeLessThan(0);
    expect(comparePrintSetCodes("q1", "9")).toBeGreaterThan(0);
  });
});

describe("printCollectableKey", () => {
  it("ignores set for game-unique collector numbers", () => {
    expect(isGameUniqueCollectorNumber("d0123")).toBe(true);
    expect(isGameUniqueCollectorNumber("sp0025")).toBe(true);
    expect(isGameUniqueCollectorNumber("1")).toBe(false);
    expect(isGameUniqueCollectorNumber("001")).toBe(false);
    expect(printCollectableKey("dbsjcc:part1-d0123")).toBe("dbsjcc|d0123|");
    expect(printCollectableKey("dbsjcc:part9-d0123")).toBe("dbsjcc|d0123|");
    expect(printCollectableKey("dbsjcc:part4-d0437-kaio")).toBe(
      "dbsjcc|d0437|kaio",
    );
    expect(printCollectableKey("lorcana:1-1")).toBeNull();
  });
});

describe("comparePrintKeys", () => {
  it("orders by set then collector number then base before promo", () => {
    const keys = [
      "lorcana:2-1",
      "lorcana:1-20-p1",
      "lorcana:1-20",
      "lorcana:1-2",
      "lorcana:1-10",
      "lorcana:3-4a",
      "lorcana:3-4b",
    ];
    expect([...keys].sort(comparePrintKeys)).toEqual([
      "lorcana:1-2",
      "lorcana:1-10",
      "lorcana:1-20",
      "lorcana:1-20-p1",
      "lorcana:2-1",
      "lorcana:3-4a",
      "lorcana:3-4b",
    ]);
  });

  it("places missing keys after real prints", () => {
    expect(comparePrintKeys(null, "lorcana:1-1")).toBeGreaterThan(0);
    expect(comparePrintKeys("lorcana:1-1", null)).toBeLessThan(0);
  });

  describe("registerPrintKeyCompare", () => {
    afterEach(() => {
      unregisterPrintKeyCompare("demo");
    });

    it("lets a game override set order then falls through for others", () => {
      registerPrintKeyCompare("demo", (a, b) => {
        const order = ["z", "a"];
        const ia = order.indexOf(a.set);
        const ib = order.indexOf(b.set);
        if (ia === -1 && ib === -1) return null;
        return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
      });
      expect(
        [...["demo:a-1", "demo:z-1"]].sort(comparePrintKeys),
      ).toEqual(["demo:z-1", "demo:a-1"]);
      expect(comparePrintKeys("lorcana:1-2", "lorcana:1-10")).toBeLessThan(0);
    });
  });
});
