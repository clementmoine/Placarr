import { describe, expect, it } from "vitest";

import { LIVE_FINISH_CSS } from "./cssRecipes";
import {
  liveLeavesMissingSimeyIso,
  simeyDemoUrl,
  simeyIsoForLeaf,
  simeyStagingCssPath,
  SIMEY_ISO_BY_LEAF,
} from "./simeyIsoCompare";

describe("simeyIsoCompare", () => {
  it("covers every LIVE_FINISH_CSS leaf with a demo target", () => {
    expect(liveLeavesMissingSimeyIso()).toEqual([]);
    for (const [leaf, cssId] of Object.entries(LIVE_FINISH_CSS)) {
      const t = SIMEY_ISO_BY_LEAF[leaf];
      expect(t, leaf).toBeTruthy();
      expect(t!.cssId).toBe(cssId);
      expect(t!.stem.length).toBeGreaterThan(0);
      expect(simeyDemoUrl(t!)).toMatch(/^https:\/\/poke-(holo|151)\.simey\.me\//);
      expect(simeyStagingCssPath(t!)).toContain(`/${t!.stem}.css`);
    }
  });

  it("points AngledPillars at Ultra Rare Kangaskhan, not Double Rare", () => {
    const t = simeyIsoForLeaf("AngledPillars");
    expect(t?.stem).toBe("ex-full-art");
    expect(t?.demoPick).toMatch(/190/);
    expect(t?.demoPick).toMatch(/Ultra Rare/i);
  });

  it("points SunPillar at Double Rare Kangaskhan", () => {
    const t = simeyIsoForLeaf("SunPillar");
    expect(t?.stem).toBe("ex-regular");
    expect(t?.demoPick).toMatch(/115|Double Rare/i);
  });
});
