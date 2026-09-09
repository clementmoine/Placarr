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

  it("routes promo groupings to Pn sets", () => {
    expect(dotggLookupFromPrintKey("lorcana:11-34-p3")).toEqual({
      setId: "P3",
      number: "34",
    });
    expect(dotggLookupFromPrintKey("lorcana:13-15-p4")).toEqual({
      setId: "P4",
      number: "15",
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
