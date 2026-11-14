import { describe, expect, it } from "vitest";

import { normalizeSetMemberships, planSetCodeExpand } from "./setCodeExpand";

describe("planSetCodeExpand", () => {
  it("stamps a single membership", () => {
    expect(planSetCodeExpand(["s3"])).toEqual({
      kind: "stamp",
      setCode: "s3",
    });
  });

  it("expands multi-set reprints: keep first, create the rest", () => {
    expect(planSetCodeExpand(["s5", "s1"])).toEqual({
      kind: "expand",
      keepSetCode: "s1",
      createSetCodes: ["s5"],
    });
  });

  it("dedupes and sorts memberships", () => {
    expect(normalizeSetMemberships(["s10", "S1", "s1", "  "])).toEqual([
      "s1",
      "s10",
    ]);
  });

  it("does nothing when the catalogue lists no set", () => {
    expect(planSetCodeExpand([])).toEqual({ kind: "none" });
  });
});
