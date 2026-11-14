import { describe, expect, it } from "vitest";

import {
  FOIL_EFFECTS_LEAN_TIME_X,
  FOIL_EFFECTS_LEAN_TIME_Y,
  foilEffectsClockSeconds,
  foilEffectsLayersScroll,
  foilEffectsLeanTimePhase,
  foilLeanAmplitude,
  foilScrollModeForInteraction,
  liveWebglTiltFromLight,
  tiltFromLightPercent,
} from "./leanPolicy";

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

describe("liveWebglTiltFromLight", () => {
  it("maps pointer-bottom to +lean.y (N tips toward card top / +Z)", () => {
    // VS local.z = uv.y - 0.5 → top = +Z; CSS dip at bottom raises top → +N·Z.
    expect(liveWebglTiltFromLight(50, 100, 1)[0]).toBeCloseTo(0);
    expect(liveWebglTiltFromLight(50, 100, 1)[1]).toBeCloseTo(1);
    expect(liveWebglTiltFromLight(50, 0, 1)[1]).toBeCloseTo(-1);
    expect(liveWebglTiltFromLight(50, 50, 1)[1]).toBeCloseTo(0);
    expect(liveWebglTiltFromLight(100, 50, 1)[0]).toBeCloseTo(1);
  });
});

describe("foilLeanAmplitude", () => {
  it("uses sheet _TimeFactor for dual-frag CosTime", () => {
    expect(foilLeanAmplitude({ timeFactor: 0.4, hasTimeSibling: true })).toBe(
      0.4,
    );
    expect(foilLeanAmplitude({ timeFactor: 0.33 })).toBe(0.33);
  });

  it("uses full ±1 for Live HoloFoil (no _TimeFactor) so light/camera move", () => {
    expect(foilLeanAmplitude({ hasTimeSibling: false })).toBe(1);
    expect(foilLeanAmplitude({})).toBe(1);
  });

  it("falls back to 0.4 when dual-frag has no explicit factor", () => {
    expect(foilLeanAmplitude({ hasTimeSibling: true })).toBe(0.4);
  });
});

describe("foilEffectsLeanTimePhase / clock", () => {
  it("detects scrolling EffectsLayers from MotionSpeed", () => {
    expect(foilEffectsLayersScroll({ _EffectsLayer1MotionSpeed: 0 })).toBe(
      false,
    );
    expect(foilEffectsLayersScroll({ _EffectsLayer1MotionSpeed: 6 })).toBe(
      true,
    );
  });

  it("is 0 when no EffectsLayer is scrolling", () => {
    expect(
      foilEffectsLeanTimePhase([1, 0], { _EffectsLayer1MotionSpeed: 0 }),
    ).toBe(0);
  });

  it("idle: wall clock advances with lean 0 (shimmer at rest)", () => {
    expect(
      foilEffectsClockSeconds(10, [0, 0], { _EffectsLayer1MotionSpeed: 6 }),
    ).toBe(10);
  });

  it("tilt: lean phases _Time on top of the wall clock", () => {
    expect(
      foilEffectsLeanTimePhase([1, 0], { _EffectsLayer1MotionSpeed: 6 }),
    ).toBeCloseTo(FOIL_EFFECTS_LEAN_TIME_X);
    expect(
      foilEffectsLeanTimePhase([0, 1], { _EffectsLayer2MotionSpeed: 12 }),
    ).toBeCloseTo(FOIL_EFFECTS_LEAN_TIME_Y);
    expect(
      foilEffectsClockSeconds(10, [1, 0], { _EffectsLayer1MotionSpeed: 6 }),
    ).toBeCloseTo(10 + FOIL_EFFECTS_LEAN_TIME_X);
  });

  it("still steers EffectsLayers when Holo is on", () => {
    expect(
      foilEffectsLeanTimePhase([1, 0], {
        _HoloFoilEnabled: 1,
        _EffectsLayer1MotionSpeed: 3,
      }),
    ).toBeCloseTo(FOIL_EFFECTS_LEAN_TIME_X);
  });
});

describe("foilScrollModeForInteraction", () => {
  it("keeps the _Time clock on for single-frag Live materials under the pointer", () => {
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

  it("swaps dual-frag to tilt while driven", () => {
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

  it("prefers tilt when reduced motion and idle", () => {
    expect(
      foilScrollModeForInteraction({
        isDriven: false,
        hasTimeSibling: false,
        prefersReducedMotion: true,
      }),
    ).toBe("tilt");
  });
});
