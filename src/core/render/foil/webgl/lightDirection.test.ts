import { describe, expect, it } from "vitest";

import {
  aceFoilNormalLatticeOffset,
  cameraPosFromTilt,
  flatEtchViewFactor,
  lightDirectionFromTilt,
  LIVE_MESH_LEAN_SCALE,
  LIVE_REST_MESH_LEAN,
  liveCardTbnFromLean,
  meshLeanFromTilt,
  meshLeanWithRestBias,
  restLightFromSheet,
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

  it("Stamped-class +Z rest stays on +Z at idle and leans in XY", () => {
    expect(lightDirectionFromTilt(0, 0, [0, 0, 1])).toEqual([0, 0, 1]);
    const [x, y, z] = lightDirectionFromTilt(1, 0, [0, 0, 1]);
    expect(z).toBeGreaterThan(0);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeCloseTo(0, 6);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
  });

  it("SunPillar-class −Z rest stays on −Z at idle", () => {
    expect(lightDirectionFromTilt(0, 0, [0, 0, -1])).toEqual([0, 0, -1]);
  });
});

describe("restLightFromSheet", () => {
  it("defaults to +Y and unitizes MAT RGB", () => {
    expect(restLightFromSheet(null)).toEqual([0, 1, 0]);
    expect(restLightFromSheet([0, 0, 2, 0])).toEqual([0, 0, 1]);
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
  it("rests at elevated-frontal (0, 1.7, 1.3)", () => {
    expect(cameraPosFromTilt(0, 0)).toEqual([0, 1.7, 1.3]);
    expect(cameraPosFromTilt(0.4, -0.3)).toEqual([0, 1.7, 1.3]);
  });

  it("ignores lean — Live camera is rest-fixed (mesh tip is u_CardLean)", () => {
    expect(cameraPosFromTilt(1, 0)).toEqual([0, 1.7, 1.3]);
    expect(cameraPosFromTilt(-1, 1)).toEqual([0, 1.7, 1.3]);
  });

  it("AceFoil/Squares-class face N·V (flat etch ≈ +Y) stays bright enough at rest", () => {
    const cam = cameraPosFromTilt(0, 0);
    const len = Math.hypot(cam[0], cam[1], cam[2]) || 1;
    // albedo *= N·V (Squares twice) — (0,1,2) was ~0.45; keep ≥ ~0.75.
    expect(cam[1] / len).toBeGreaterThanOrEqual(0.75);
  });
});

describe("flatEtchViewFactor", () => {
  it("pure +Y camera kills FlatSilver shine (N·V = 0)", () => {
    expect(flatEtchViewFactor([0, 2, 0])).toBeCloseTo(0, 6);
  });

  it("rest camera bias keeps FlatSilver flat-etch N·V > 0", () => {
    const nDotV = flatEtchViewFactor(cameraPosFromTilt(0, 0));
    expect(nDotV).toBeGreaterThan(0.3);
  });

  it("fixed cam + mesh-scaled tip keeps left/right mid B·V > 0", () => {
    const cam = cameraPosFromTilt(0, 0);
    const left = meshLeanFromTilt(-1, 0);
    const right = meshLeanFromTilt(1, 0);
    expect(flatEtchViewFactor(cam, [0, 0, 0], left)).toBeGreaterThan(0.2);
    expect(flatEtchViewFactor(cam, [0, 0, 0], right)).toBeGreaterThan(0.2);
  });

  it("fixed cam + mesh tip at bottom/top edges keeps B·V > 0", () => {
    const cam = cameraPosFromTilt(0, 0);
    expect(
      flatEtchViewFactor(cam, [0, 0, 0], meshLeanFromTilt(0, 1)),
    ).toBeGreaterThan(0.2);
    expect(
      flatEtchViewFactor(cam, [0, 0, 0], meshLeanFromTilt(0, -1)),
    ).toBeGreaterThan(0.2);
  });
});

describe("meshLeanFromTilt", () => {
  it("scales full light lean down to CSS ±18° tip", () => {
    expect(LIVE_MESH_LEAN_SCALE).toBeCloseTo(Math.tan((18 * Math.PI) / 180), 6);
    expect(meshLeanFromTilt(1, -1)).toEqual([
      LIVE_MESH_LEAN_SCALE,
      -LIVE_MESH_LEAN_SCALE,
    ]);
  });
});

describe("meshLeanWithRestBias", () => {
  it("rest bias equals one full CSS +Y tip (soft SunLava spectrum pose)", () => {
    expect(LIVE_REST_MESH_LEAN).toEqual([0, LIVE_MESH_LEAN_SCALE]);
  });

  it("biases Z-rest leaves (SunLava +Z / SunPillar −Z) at idle", () => {
    expect(meshLeanWithRestBias(0, 0, [0, 0, 1])).toEqual(LIVE_REST_MESH_LEAN);
    expect(meshLeanWithRestBias(0, 0, [0, 0, -1])).toEqual(LIVE_REST_MESH_LEAN);
  });

  it("leaves Y-rest leaves (AceFoil) unbiased so lattice rests flat", () => {
    expect(meshLeanWithRestBias(0, 0, [0, 1, 0])).toEqual([0, 0]);
    expect(meshLeanWithRestBias(1, -1, [0, 1, 0])).toEqual(
      meshLeanFromTilt(1, -1),
    );
  });

  it("adds bias on top of pointer tip for Z-rest", () => {
    const tip = meshLeanFromTilt(0, 1);
    expect(meshLeanWithRestBias(0, 1, [0, 0, 1])).toEqual([
      tip[0] + LIVE_REST_MESH_LEAN[0],
      tip[1] + LIVE_REST_MESH_LEAN[1],
    ]);
  });
});

describe("SunPillar mesh-N etch gate", () => {
  it("top-center light lean does not zero clamp(N·V+0.16) under mesh tip", () => {
    /*
      SunPillar multiplies whole albedo by clamp(meshN·V + 0.16).
      Full ±1 into u_CardLean → N·V≈-0.32 → black card; mesh scale stays >0.
      Pointer-top → liveWebglTiltFromLight y=−1 (N tips toward card bottom / −Z).
    */
    const cam = cameraPosFromTilt(0, 0);
    const mesh = meshLeanFromTilt(0, -1); // top-center → setTilt(0,−1)
    const { N } = liveCardTbnFromLean(mesh[0], mesh[1]);
    const len = Math.hypot(cam[0], cam[1], cam[2]) || 1;
    const nDotV = (N[0] * cam[0] + N[1] * cam[1] + N[2] * cam[2]) / len;
    expect(nDotV + 0.16).toBeGreaterThan(0.2);
  });
});
