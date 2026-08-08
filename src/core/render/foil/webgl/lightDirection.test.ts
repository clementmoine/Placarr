import { describe, expect, it } from "vitest";

import { cameraPosFromTilt, lightDirectionFromTilt } from "./lightDirection";

describe("lightDirectionFromTilt", () => {
  it("rests at the MAT sheet neutral (0,1,0) — card lies flat, normal +Y", () => {
    expect(lightDirectionFromTilt(0, 0)).toEqual([0, 1, 0]);
  });

  it("keeps a unit vector with positive Y", () => {
    const [x, y, z] = lightDirectionFromTilt(0.6, -0.8);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
    expect(y).toBeGreaterThan(0);
  });

  it("swings X with the horizontal lean and Z with the vertical one", () => {
    const [x1, , z1] = lightDirectionFromTilt(1, 0);
    expect(x1).toBeGreaterThan(0);
    expect(z1).toBe(0);
    const [x2, , z2] = lightDirectionFromTilt(0, 1);
    expect(x2).toBe(0);
    expect(z2).toBeGreaterThan(0);
  });
});

describe("cameraPosFromTilt", () => {
  it("rests above the card at (0, 2, 0)", () => {
    expect(cameraPosFromTilt(0, 0)).toEqual([0, 2, 0]);
  });

  it("offsets X/Z with lean for view-dependent frags (SolidColor)", () => {
    const [x, y, z] = cameraPosFromTilt(0.4, -0.3);
    expect(x).toBeCloseTo(0.8);
    expect(y).toBe(2);
    expect(z).toBeCloseTo(-0.6);
  });
});
