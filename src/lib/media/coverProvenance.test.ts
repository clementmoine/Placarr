import { describe, expect, it } from "vitest";

import {
  COVER_PROVENANCE_ORDER,
  coverProvenanceRank,
  resolveCoverProvenance,
} from "./coverProvenance";

describe("coverProvenance", () => {
  it("orders catalog above listing photos above user photos", () => {
    expect(COVER_PROVENANCE_ORDER).toEqual([
      "catalog",
      "listing_photo",
      "user_photo",
    ]);
    expect(coverProvenanceRank("catalog")).toBeLessThan(
      coverProvenanceRank("listing_photo"),
    );
    expect(coverProvenanceRank("listing_photo")).toBeLessThan(
      coverProvenanceRank("user_photo"),
    );
  });

  it("treats unknown/absent provenance as catalog (never demote without evidence)", () => {
    expect(coverProvenanceRank(undefined)).toBe(coverProvenanceRank("catalog"));
    expect(coverProvenanceRank(null)).toBe(0);
    expect(coverProvenanceRank("garbage")).toBe(0);
  });

  it("uses the provider-declared provenance when present", () => {
    expect(resolveCoverProvenance({ provenance: "catalog" })).toBe("catalog");
    expect(resolveCoverProvenance({ provenance: "listing_photo" })).toBe(
      "listing_photo",
    );
    expect(resolveCoverProvenance({ provenance: "user_photo" })).toBe(
      "user_photo",
    );
  });

  it("defaults to catalog when nothing is declared (never demote without evidence)", () => {
    expect(resolveCoverProvenance({})).toBe("catalog");
    expect(resolveCoverProvenance({ provenance: null })).toBe("catalog");
    expect(resolveCoverProvenance({ provenance: "garbage" })).toBe("catalog");
  });
});
