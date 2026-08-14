import { describe, expect, it } from "vitest";

import { parsePrintKey } from "@/core/identify/printKey";

import {
  dbsPrintKey,
  formatDbsCollectorNumber,
  formatDbsReference,
  parseDbsCollectorNumber,
} from "./printIdentity";

describe("parseDbsCollectorNumber", () => {
  it.each([
    ["BT1-001", { set: "bt1", number: "001", grouping: null }],
    ["bt1-001", { set: "bt1", number: "001", grouping: null }],
    ["BT11-003", { set: "bt11", number: "003", grouping: null }],
    ["P-001", { set: "p", number: "001", grouping: null }],
    ["TB2-015", { set: "tb2", number: "015", grouping: null }],
    ["BT1-011_SPR", { set: "bt1", number: "011", grouping: "spr" }],
    ["BT1-014_PR", { set: "bt1", number: "014", grouping: "pr" }],
  ] as const)("%s", (raw, expected) => {
    expect(parseDbsCollectorNumber(raw)).toEqual(expected);
  });

  it("rejects a number that cannot round-trip through printKey", () => {
    expect(parseDbsCollectorNumber("Champa")).toBeNull();
    expect(parseDbsCollectorNumber("BT1")).toBeNull();
    expect(parseDbsCollectorNumber("")).toBeNull();
  });
});

describe("dbsPrintKey", () => {
  it("splits set and number so the hyphen is the printKey separator", () => {
    expect(dbsPrintKey("BT1-001")).toBe("dbscg:bt1-001");
    expect(parsePrintKey("dbscg:bt1-001")).toEqual({
      game: "dbscg",
      set: "bt1",
      number: "001",
      grouping: null,
    });
  });

  it("puts Bandai _SPR / _PR into grouping, not the collector number", () => {
    expect(dbsPrintKey("BT1-011_SPR")).toBe("dbscg:bt1-011-spr");
    expect(parsePrintKey("dbscg:bt1-011-spr")).toEqual({
      game: "dbscg",
      set: "bt1",
      number: "011",
      grouping: "spr",
    });
  });
});

describe("formatDbsCollectorNumber", () => {
  it("prints the number the way it is on the card", () => {
    expect(formatDbsCollectorNumber("bt1", "001")).toBe("BT1-001");
    expect(formatDbsCollectorNumber("bt1", "011", "spr")).toBe("BT1-011_SPR");
    expect(formatDbsReference("p", "001")).toBe("P-001");
  });
});
