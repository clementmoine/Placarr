import { describe, expect, it } from "vitest";

// Installs the SQLite `card_foil` lookups; without it the pack sees stubs.
import "./cardFoilIndex";

import { LIVE_FINISH_CSS } from "./cssRecipes";
import {
  liveLeavesMissingSimeyAnchor,
  SIMEY_DEMO_ANCHORS,
  simeyAnchorForLeaf,
} from "./simeyDemoAnchors";
import { listPlayroomArtsForMaterial } from "./playroomArt";
import { variantsForBundle } from "./cardFoilLookups";

describe("simeyDemoAnchors", () => {
  it("covers every LIVE_FINISH_CSS leaf", () => {
    expect(liveLeavesMissingSimeyAnchor()).toEqual([]);
  });

  it("points AngledPillars at Kangaskhan ex #190 Ultra Rare in catalogue", () => {
    const a = simeyAnchorForLeaf("AngledPillars");
    expect(a?.stem).toBe("ex-full-art");
    expect(a?.bundleId).toBe("sv3-5_fr_190");
    expect(a?.pokeId).toBe("sv3pt5-190");
    expect(a?.tree).toBe("poke-151");
  });

  it("points SunPillar at Kangaskhan ex #115 Double Rare", () => {
    const a = simeyAnchorForLeaf("SunPillar");
    expect(a?.bundleId).toBe("sv3-5_fr_115");
    expect(a?.stem).toBe("ex-regular");
  });

  it("every anchor bundle exists in the Live dump", () => {
    for (const [leaf, a] of Object.entries(SIMEY_DEMO_ANCHORS)) {
      expect(
        variantsForBundle(a.bundleId).length,
        `${leaf} → ${a.bundleId}`,
      ).toBeGreaterThan(0);
    }
  });

  it("cssId matches LIVE_FINISH_CSS", () => {
    for (const leaf of Object.keys(LIVE_FINISH_CSS)) {
      expect(simeyAnchorForLeaf(leaf)?.cssId).toBe(LIVE_FINISH_CSS[leaf]);
    }
  });
});

describe("listPlayroomArtsForMaterial Simey second face", () => {
  it("inserts Simey Kangaskhan #190 as second AngledPillars face", () => {
    const arts = listPlayroomArtsForMaterial("AngledPillars", 4);
    expect(arts.length).toBeGreaterThanOrEqual(2);
    expect(arts[0]?.bundleId).not.toBe("sv3-5_fr_190");
    expect(arts[1]?.bundleId).toBe("sv3-5_fr_190");
    expect(arts[1]?.label).toMatch(/Simey ex-full-art/i);
  });

  it("keeps Radiant Charizard as hero and tags Simey when it is the seed", () => {
    const arts = listPlayroomArtsForMaterial("RadiantHolo", 4);
    expect(arts[0]?.bundleId).toBe("swsh10-5_fr_011");
    expect(arts[0]?.label).toMatch(/Simey radiant-holo/i);
  });
});
