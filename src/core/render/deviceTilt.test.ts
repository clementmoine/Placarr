import { describe, expect, it } from "vitest";

import {
  gravityFromOrientation,
  leanFromPointer,
  leanFromGravity,
  orientationNeedsPermission,
  smoothGravity,
  type GravityVector,
} from "./deviceTilt";

const FLAT: GravityVector = { x: 0, y: 0, z: -1 };

describe("gravityFromOrientation", () => {
  it("points straight down when the phone lies flat", () => {
    const gravity = gravityFromOrientation({ beta: 0, gamma: 0 })!;
    expect(gravity.x).toBeCloseTo(0, 6);
    expect(gravity.y).toBeCloseTo(0, 6);
    expect(gravity.z).toBeCloseTo(-1, 6);
  });

  it("swings sideways when the phone is rolled", () => {
    expect(gravityFromOrientation({ beta: 0, gamma: 90 })!.x).toBeCloseTo(
      -1,
      6,
    );
    expect(gravityFromOrientation({ beta: 0, gamma: -90 })!.x).toBeCloseTo(
      1,
      6,
    );
  });

  it("swings forward when the phone is stood up", () => {
    expect(gravityFromOrientation({ beta: 90, gamma: 0 })!.y).toBeCloseTo(
      -1,
      6,
    );
  });

  it("moves smoothly through the angle where Euler values degenerate", () => {
    // Held upright, `gamma` jumps the width of its range for a movement of a
    // degree. A direction has no such seam, so neighbouring readings must stay
    // neighbouring — otherwise the card snaps end to end in the hand.
    const a = gravityFromOrientation({ beta: 89, gamma: 0 })!;
    const b = gravityFromOrientation({ beta: 91, gamma: 180 })!;
    const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(distance).toBeLessThan(0.1);
  });

  it("lets the roll fade out as the phone is stood upright", () => {
    // Held flat, rolling the phone swings the card sideways. Held vertical, the
    // same roll is a spin around the axis you are looking down, and must not:
    // dropping the `cos(beta)` term made the card lurch whenever the phone was
    // raised to read it.
    const flat = Math.abs(gravityFromOrientation({ beta: 0, gamma: 45 })!.x);
    const upright = Math.abs(
      gravityFromOrientation({ beta: 90, gamma: 45 })!.x,
    );
    expect(upright).toBeLessThan(flat / 10);
  });

  it("has nothing to say without a reading", () => {
    expect(gravityFromOrientation({ beta: null, gamma: 0 })).toBeNull();
    expect(gravityFromOrientation({ beta: 0, gamma: null })).toBeNull();
    expect(gravityFromOrientation({ beta: Number.NaN, gamma: 0 })).toBeNull();
  });
});

describe("smoothGravity", () => {
  it("takes the first reading whole, having nothing to blend with", () => {
    expect(smoothGravity(null, { x: 1, y: 2, z: 3 }, 0.1)).toEqual({
      x: 1,
      y: 2,
      z: 3,
    });
  });

  it("moves part of the way towards the new reading", () => {
    expect(smoothGravity(FLAT, { x: 1, y: 0, z: -1 }, 0.25).x).toBeCloseTo(
      0.25,
      6,
    );
  });

  it("refuses to overshoot however wild the weight", () => {
    // A weight above 1 would swing past the target and oscillate.
    expect(smoothGravity(FLAT, { x: 1, y: 0, z: -1 }, 5).x).toBeCloseTo(1, 6);
    expect(smoothGravity(FLAT, { x: 1, y: 0, z: -1 }, -5).x).toBeCloseTo(0, 6);
  });
});

describe("leanFromGravity", () => {
  it("rests flat and centred at the angle the phone was first held at", () => {
    // Nobody holds a phone at zero degrees. Without this the card would start
    // tipped over and never come back to rest.
    const held: GravityVector = { x: 0.3, y: -0.5, z: -0.8 };
    expect(leanFromGravity(held, held, 18)).toEqual({
      tiltX: -0,
      tiltY: 0,
      lightX: 50,
      lightY: 50,
    });
  });

  it("leans away from the raised edge, as a held card does", () => {
    const lean = leanFromGravity({ x: 0.5, y: 0, z: -0.8 }, FLAT, 18);
    expect(lean.tiltY).toBeCloseTo(9, 6);
    expect(lean.lightX).toBeCloseTo(75, 6);
  });

  it("pairs forward tilt with the opposite rotation, like the pointer does", () => {
    const lean = leanFromGravity({ x: 0, y: 0.5, z: -0.8 }, FLAT, 18);
    expect(lean.tiltX).toBeCloseTo(-9, 6);
    expect(lean.lightY).toBeCloseTo(75, 6);
  });

  it("never leans further than the maximum, however far the phone turns", () => {
    const lean = leanFromGravity({ x: 4, y: -4, z: 0 }, FLAT, 18);
    expect(Math.abs(lean.tiltY)).toBeLessThanOrEqual(18);
    expect(Math.abs(lean.tiltX)).toBeLessThanOrEqual(18);
    expect(lean.lightX).toBeGreaterThanOrEqual(0);
    expect(lean.lightX).toBeLessThanOrEqual(100);
  });
});

describe("orientationNeedsPermission", () => {
  it("spots the platform that hands the sensor over only when asked", () => {
    const ios = function () {} as unknown as Record<string, unknown>;
    ios.requestPermission = () => Promise.resolve("granted");
    expect(orientationNeedsPermission(ios)).toBe(true);
  });

  it("leaves every other browser to just listen", () => {
    expect(orientationNeedsPermission(function () {})).toBe(false);
    expect(orientationNeedsPermission(undefined)).toBe(false);
    expect(orientationNeedsPermission({ requestPermission: 1 })).toBe(false);
  });
});

describe("leanFromPointer", () => {
  it("rests flat with the pointer at the centre", () => {
    expect(leanFromPointer(50, 50, 18)).toEqual({
      tiltX: -0,
      tiltY: 0,
      lightX: 50,
      lightY: 50,
    });
  });

  it("crosses the axes: sideways turns the card about its vertical one", () => {
    // A port once wired X to the up-down rotation and Y to the left-right one.
    // The card still moved, so it read as a magnetism that pushed on one axis
    // and pulled on the other rather than as an outright bug.
    const right = leanFromPointer(100, 50, 18);
    expect(right.tiltY).toBeCloseTo(18, 6);
    expect(right.tiltX).toBeCloseTo(0, 6);

    const bottom = leanFromPointer(50, 100, 18);
    expect(bottom.tiltX).toBeCloseTo(-18, 6);
    expect(bottom.tiltY).toBeCloseTo(0, 6);
  });

  it("leans away from the pointer, not into it", () => {
    expect(leanFromPointer(100, 50, 18).tiltY).toBeGreaterThan(0);
    expect(leanFromPointer(0, 50, 18).tiltY).toBeLessThan(0);
    expect(leanFromPointer(50, 0, 18).tiltX).toBeGreaterThan(0);
    expect(leanFromPointer(50, 100, 18).tiltX).toBeLessThan(0);
  });

  it("agrees with the phone about which way is which", () => {
    // Both inputs write the same properties; if they disagreed, picking a card
    // up mid-hover would flip it.
    const pointer = leanFromPointer(100, 50, 18);
    const phone = leanFromGravity({ x: 1, y: 0, z: 0 }, FLAT, 18);
    expect(Math.sign(pointer.tiltY)).toBe(Math.sign(phone.tiltY));
    expect(pointer.lightX).toBeCloseTo(phone.lightX, 6);
  });

  it("never leans past the maximum, however far outside the card", () => {
    expect(leanFromPointer(400, -400, 18).tiltY).toBeCloseTo(18, 6);
    expect(leanFromPointer(400, -400, 18).tiltX).toBeCloseTo(18, 6);
  });
});
