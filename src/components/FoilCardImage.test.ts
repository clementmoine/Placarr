import { describe, expect, it } from "vitest";

import {
  foilScrollModeForInteraction,
  tiltFromLightPercent,
} from "@/components/FoilCardImage";

describe("tiltFromLightPercent", () => {
  it("reste à 0 au centre", () => {
    expect(tiltFromLightPercent(50, 0.4)).toBe(0);
  });

  it("atteint ±timeFactor aux bords (balayage mono-axe = amplitude idle)", () => {
    expect(tiltFromLightPercent(0, 0.4)).toBeCloseTo(-0.4);
    expect(tiltFromLightPercent(100, 0.4)).toBeCloseTo(0.4);
    expect(tiltFromLightPercent(0, 0.33)).toBeCloseTo(-0.33);
  });
});

describe("foilScrollModeForInteraction", () => {
  it("keeps the _Time clock on for single-frag Live materials under the pointer", () => {
    // Freezing time on hover posed the foil; Live keeps scrolling.
    expect(
      foilScrollModeForInteraction({
        isDriven: true,
        hasTimeSibling: false,
      }),
    ).toBe("time");
    expect(
      foilScrollModeForInteraction({
        isDriven: false,
        hasTimeSibling: false,
      }),
    ).toBe("time");
  });

  it("swaps Lorcana dual-frag to tilt while driven", () => {
    expect(
      foilScrollModeForInteraction({
        isDriven: true,
        hasTimeSibling: true,
      }),
    ).toBe("tilt");
    expect(
      foilScrollModeForInteraction({
        isDriven: false,
        hasTimeSibling: true,
      }),
    ).toBe("time");
  });

  it("freezes reduced-motion idle on the tilt path", () => {
    expect(
      foilScrollModeForInteraction({
        isDriven: false,
        hasTimeSibling: false,
        prefersReducedMotion: true,
      }),
    ).toBe("tilt");
  });
});
