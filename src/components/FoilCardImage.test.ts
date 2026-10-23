import { describe, expect, it } from "vitest";

import {
  foilLeanAmplitude,
  foilScrollModeForInteraction,
  tiltFromLightPercent,
} from "@/components/FoilCardImage";

describe("tiltFromLightPercent", () => {
  it("reste à 0 au centre", () => {
    expect(tiltFromLightPercent(50, 0.4)).toBe(0);
  });

  it("atteint ±amplitude aux bords", () => {
    expect(tiltFromLightPercent(0, 0.4)).toBeCloseTo(-0.4);
    expect(tiltFromLightPercent(100, 0.4)).toBeCloseTo(0.4);
    expect(tiltFromLightPercent(0, 0.33)).toBeCloseTo(-0.33);
    expect(tiltFromLightPercent(100, 1)).toBeCloseTo(1);
  });
});

describe("foilLeanAmplitude", () => {
  it("uses sheet _TimeFactor for Lorcana CosTime / dual-frag", () => {
    expect(foilLeanAmplitude({ timeFactor: 0.4, hasTimeSibling: true })).toBe(
      0.4,
    );
    expect(foilLeanAmplitude({ timeFactor: 0.33 })).toBe(0.33);
  });

  it("uses full ±1 for Live HoloFoil (no _TimeFactor) so light/camera move", () => {
    // Pokémon sheets omit _TimeFactor; the old 0.4 default starved _LightDirection.
    expect(foilLeanAmplitude({ hasTimeSibling: false })).toBe(1);
    expect(foilLeanAmplitude({})).toBe(1);
  });

  it("falls back to 0.4 when dual-frag has no explicit factor", () => {
    expect(foilLeanAmplitude({ hasTimeSibling: true })).toBe(0.4);
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
