import { describe, expect, it } from "vitest";

import {
  isOwnedPlayroomBundle,
  ownedBundlesForShader,
} from "./liveOwnedBundles";

describe("liveOwnedBundles", () => {
  it("lists carddex-synced owned faces from liveOwned.json", () => {
    expect(ownedBundlesForShader("SunPillar")).toContain("me5_fr_045");
    expect(ownedBundlesForShader("SunPillar").length).toBeGreaterThan(1);
    expect(ownedBundlesForShader("FlatSilver").length).toBeGreaterThan(0);
    expect(ownedBundlesForShader("Thatch")).toContain("bwalt_fr_008");
    expect(ownedBundlesForShader("Galaxy")).toContain("xy12_fr_011");
    expect(ownedBundlesForShader("Cosmos")).toContain("smalt_fr_013");
    expect(ownedBundlesForShader("AngledPillars")[0]).toBe("smalt_fr_001");
  });

  it("isOwnedPlayroomBundle scopes to shader when given", () => {
    expect(isOwnedPlayroomBundle("me5_fr_045", "SunPillar")).toBe(true);
    expect(isOwnedPlayroomBundle("me5_fr_045", "Galaxy")).toBe(false);
    expect(isOwnedPlayroomBundle("me5_fr_045")).toBe(true);
  });
});
