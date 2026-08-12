import { describe, expect, it } from "vitest";

import "@/effects/pokemon/cardFoilIndex";

import { preferForLiveOpen } from "@/lib/admin/liveOpen";

describe("preferForLiveOpen", () => {
  it("prefers ph when that variant carries AngledPillars (ec_fr_010)", () => {
    expect(preferForLiveOpen("ec_fr_010", "AngledPillars")).toBe("ph");
  });

  it("keeps std for AngledPillars on smalt_fr_001", () => {
    expect(preferForLiveOpen("smalt_fr_001", "AngledPillars")).toBe("");
  });

  it("prefers mph Master Ball FlatSilver on rsv10-5_fr_044 (not dump ph)", () => {
    expect(preferForLiveOpen("rsv10-5_fr_044", "FlatSilver")).toBe("mph");
  });
});
