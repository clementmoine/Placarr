import { describe, expect, it } from "vitest";

import { parsePrintKey } from "@/core/identify/printKey";

import {
  dbsFwPrintKey,
  formatDbsFwCollectorNumber,
  parseDbsFwCollectorNumber,
} from "./printIdentity";

describe("parseDbsFwCollectorNumber", () => {
  it.each([
    ["ST01-001", { set: "st01", number: "001", grouping: null }],
    ["FB10-003", { set: "fb10", number: "003", grouping: null }],
    ["FS01-01", { set: "fs01", number: "01", grouping: null }],
  ] as const)("%s", (raw, expected) => {
    expect(parseDbsFwCollectorNumber(raw)).toEqual(expected);
  });
});

describe("dbsFwPrintKey", () => {
  it("uses a distinct game slug from Masters", () => {
    expect(dbsFwPrintKey("ST01-001")).toBe("dbsfw:st01-001");
    expect(parsePrintKey("dbsfw:st01-001")).toEqual({
      game: "dbsfw",
      set: "st01",
      number: "001",
      grouping: null,
    });
  });

  it("puts Bandai p=_p1 into grouping", () => {
    expect(dbsFwPrintKey("ST01-001", "_p1")).toBe("dbsfw:st01-001-p1");
    expect(formatDbsFwCollectorNumber("st01", "001", "p1")).toBe("ST01-001_P1");
  });
});
