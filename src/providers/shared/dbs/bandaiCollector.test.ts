import { describe, expect, it } from "vitest";

import {
  bandaiPrintIdentity,
  bandaiPrintKey,
  formatBandaiCollectorNumber,
  normalizeBandaiParallel,
  parseBandaiCollectorNumber,
} from "@/providers/shared/dbs/bandaiCollector";

describe("parseBandaiCollectorNumber", () => {
  it("parses Masters and Fusion World collector numbers", () => {
    expect(parseBandaiCollectorNumber("BT1-001")).toEqual({
      set: "bt1",
      number: "001",
      grouping: null,
    });
    expect(parseBandaiCollectorNumber("BT1-011_SPR")).toEqual({
      set: "bt1",
      number: "011",
      grouping: "spr",
    });
    expect(parseBandaiCollectorNumber("ST01-001")).toEqual({
      set: "st01",
      number: "001",
      grouping: null,
    });
    expect(parseBandaiCollectorNumber("FB10-003_p1")).toEqual({
      set: "fb10",
      number: "003",
      grouping: "p1",
    });
    expect(parseBandaiCollectorNumber("")).toBeNull();
  });
});

describe("bandaiPrintIdentity / printKey", () => {
  it("builds identities per game slug", () => {
    expect(bandaiPrintIdentity("dbscg", "BT1-001")).toEqual({
      game: "dbscg",
      set: "bt1",
      number: "001",
      grouping: null,
    });
    expect(bandaiPrintKey("dbsfw", "ST01-001")).toBe("dbsfw:st01-001");
    expect(bandaiPrintIdentity("dbsfw", "FB10-003", "_p1")?.grouping).toBe(
      "p1",
    );
  });
});

describe("format / parallel helpers", () => {
  it("formats printed numbers and normalizes parallels", () => {
    expect(formatBandaiCollectorNumber("bt1", "011", "spr")).toBe(
      "BT1-011_SPR",
    );
    expect(normalizeBandaiParallel("_p1")).toBe("p1");
    expect(normalizeBandaiParallel(null)).toBeNull();
  });
});
