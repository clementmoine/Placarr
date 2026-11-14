/**
 * Scroll mode × fragmentTime — integration of leanPolicy with material shape.
 * FoilCardImage engages tilt only when a dual-frag sibling exists.
 */
import { describe, expect, it } from "vitest";

import {
  foilLeanAmplitude,
  foilScrollModeForInteraction,
} from "./leanPolicy";
import { foilMaterialHasTimeSibling } from "./resolveCardMaterial";

describe("scroll mode + fragmentTime", () => {
  it("single-frag Live keeps time clock while pointer-driven", () => {
    const material = { fragment: "SunPillar.frag" };
    const hasTimeSibling = foilMaterialHasTimeSibling(material);
    expect(hasTimeSibling).toBe(false);
    expect(
      foilScrollModeForInteraction({
        isDriven: true,
        hasTimeSibling,
      }),
    ).toBe("time");
    // engageTiltProgram would be ignored for Live (hasTimeSibling false).
    expect(foilLeanAmplitude({ hasTimeSibling })).toBe(1);
  });

  it("dual-frag swaps to tilt while driven and uses TimeFactor amplitude", () => {
    const material = {
      fragment: "CardFoilLore___SCROLLMODE_TILT.frag",
      fragmentTime: "CardFoilLore___SCROLLMODE_TIME.frag",
      floats: { _TimeFactor: 0.33 },
    };
    const hasTimeSibling = foilMaterialHasTimeSibling(material);
    expect(hasTimeSibling).toBe(true);
    expect(
      foilScrollModeForInteraction({
        isDriven: true,
        hasTimeSibling,
      }),
    ).toBe("tilt");
    expect(
      foilScrollModeForInteraction({
        isDriven: false,
        hasTimeSibling,
      }),
    ).toBe("time");
    expect(
      foilLeanAmplitude({
        timeFactor: material.floats._TimeFactor,
        hasTimeSibling,
      }),
    ).toBe(0.33);
  });

  it("reduced-motion idle freezes on tilt even for single-frag", () => {
    expect(
      foilScrollModeForInteraction({
        isDriven: false,
        hasTimeSibling: false,
        prefersReducedMotion: true,
      }),
    ).toBe("tilt");
  });
});
