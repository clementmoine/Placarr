import { describe, expect, it } from "vitest";

import { icollectCoverRegionRole } from "./fetch";
import { icollectCoverRegionFromAgeRating } from "./imageLabels";

describe("icollectCoverRegionFromAgeRating", () => {
  it("maps rating boards to gallery region tokens", () => {
    expect(icollectCoverRegionFromAgeRating("PEGI 18")).toBe("eu");
    expect(icollectCoverRegionFromAgeRating("ESRB M")).toBe("us");
    expect(icollectCoverRegionFromAgeRating("CERO Z")).toBe("jp");
    expect(icollectCoverRegionFromAgeRating("USK 16")).toBe("eu");
  });

  it("ignores ambiguous ratings and corrupted timestamps", () => {
    expect(icollectCoverRegionFromAgeRating("3+")).toBeUndefined();
    expect(icollectCoverRegionFromAgeRating("2024-03-15 08:08:49")).toBeUndefined();
    expect(icollectCoverRegionFromAgeRating(null)).toBeUndefined();
  });
});

describe("icollectCoverRegionRole", () => {
  it("does not infer cover region from country of purchase", () => {
    expect(icollectCoverRegionRole("Japan")).toBeUndefined();
    expect(icollectCoverRegionRole("France")).toBeUndefined();
  });
});
