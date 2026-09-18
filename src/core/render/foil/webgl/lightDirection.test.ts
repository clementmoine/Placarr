import { describe, expect, it } from "vitest";

import {
  aceFoilNormalLatticeOffset,
  cameraPosFromTilt,
  lightDirectionFromTilt,
  liveCardTbnFromLean,
} from "./lightDirection";

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

describe("liveCardTbnFromLean", () => {
  it("rest matches Live VS packing T=(1,0,0) B=(0,0,1) N=(0,1,0)", () => {
    const { T, B, N } = liveCardTbnFromLean(0, 0);
    expect(T[0]).toBeCloseTo(1);
    expect(T[1]).toBeCloseTo(0);
    expect(T[2]).toBeCloseTo(0);
    expect(B[0]).toBeCloseTo(0);
    expect(B[1]).toBeCloseTo(0);
    expect(B[2]).toBeCloseTo(1);
    expect(N).toEqual([0, 1, 0]);
  });

  it("tips N with lean like _LightDirection", () => {
    const { N } = liveCardTbnFromLean(0.8, -0.4);
    expect(N).toEqual(lightDirectionFromTilt(0.8, -0.4));
  });
});

describe("aceFoilNormalLatticeOffset", () => {
  it("rest CrossTexture scroll is 0.5 (flat TBN · N)", () => {
    expect(aceFoilNormalLatticeOffset(0, 0)).toBeCloseTo(0.5, 5);
  });

  it("moves with lean — AceFoil lattice must not stay frozen", () => {
    const rest = aceFoilNormalLatticeOffset(0, 0);
    const tipped = aceFoilNormalLatticeOffset(1, 0);
    expect(Math.abs(tipped - rest)).toBeGreaterThan(0.05);
  });
});

describe("cameraPosFromTilt", () => {
  it("rests above the card at (0, 2, 0)", () => {
    expect(cameraPosFromTilt(0, 0)).toEqual([0, 2, 0]);
  });

  it("offsets X/Z with lean for view-dependent frags (SolidColor)", () => {
    const [x, y, z] = cameraPosFromTilt(0.4, -0.3);
    expect(x).toBeCloseTo(1.0);
    expect(y).toBe(2);
    expect(z).toBeCloseTo(-0.75);
  });

  it("at full Live lean (±1) walks about a card extent off rest", () => {
    const [x, y, z] = cameraPosFromTilt(1, 0);
    expect(x).toBeCloseTo(2.5);
    expect(y).toBe(2);
    expect(z).toBe(0);
  });
});
