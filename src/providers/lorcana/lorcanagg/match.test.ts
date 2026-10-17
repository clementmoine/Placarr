import { describe, expect, it } from "vitest";

import {
  dotggLookupFromPrintKey,
  dotggPromoSetFromGrouping,
  padDotggMainSetId,
  dotggIndexKey,
} from "./match";

describe("padDotggMainSetId", () => {
  it("zero-pads numeric set codes", () => {
    expect(padDotggMainSetId("1")).toBe("001");
    expect(padDotggMainSetId("13")).toBe("013");
  });

  it("uppercases alphanumeric specials", () => {
    expect(padDotggMainSetId("q1")).toBe("Q1");
  });
});

describe("dotggPromoSetFromGrouping", () => {
  it("maps pN groupings to DotGG promo sets", () => {
    expect(dotggPromoSetFromGrouping("p3")).toBe("P3");
    expect(dotggPromoSetFromGrouping("P4")).toBe("P4");
    expect(dotggPromoSetFromGrouping(null)).toBeNull();
  });
});

describe("dotggLookupFromPrintKey", () => {
  it("pads main-set printKeys", () => {
    expect(dotggLookupFromPrintKey("lorcana:1-1")).toEqual({
      setId: "001",
      number: "1",
    });
    expect(dotggLookupFromPrintKey("lorcana:13-95")).toEqual({
      setId: "013",
      number: "95",
    });
  });

  it("routes promo groupings to market promo sets", () => {
    expect(dotggLookupFromPrintKey("lorcana:11-34-p3")).toEqual({
      setId: "P3",
      number: "34",
    });
    expect(dotggLookupFromPrintKey("lorcana:13-15-p4")).toEqual({
      setId: "P4",
      number: "15",
    });
    expect(dotggLookupFromPrintKey("lorcana:11-2-pd1")).toEqual({
      setId: "PD1",
      number: "2",
    });
    expect(dotggLookupFromPrintKey("lorcana:1-1-d23")).toEqual({
      setId: "D23",
      number: "1",
    });
    expect(dotggLookupFromPrintKey("lorcana:1-1-cc1")).toEqual({
      setId: "CC1",
      number: "1",
    });
    expect(dotggLookupFromPrintKey("lorcana:4-1-dis")).toEqual({
      setId: "DIS",
      number: "1",
    });
  });

  it("rejects non-lorcana keys", () => {
    expect(dotggLookupFromPrintKey("pokemon:1-1")).toBeNull();
    expect(dotggLookupFromPrintKey(null)).toBeNull();
  });
});

describe("dotggIndexKey", () => {
  it("normalizes set and number", () => {
    expect(dotggIndexKey("p3", "34")).toBe("P3|34");
    expect(dotggIndexKey("001", "1")).toBe("001|1");
  });
});
