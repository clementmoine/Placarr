import { describe, expect, it } from "vitest";

import {
  isLiveFoilMaskOverride,
  liveFoilMaskForBundle,
} from "./liveFoilMasks";
import { paperMaterial } from "./materials";

describe("liveFoilMaskForBundle", () => {
  it("maps Charkos-ex std → CastAndCure", () => {
    expect(liveFoilMaskForBundle("me5_fr_045", { variant: "std" })).toBe(
      "CastAndCure",
    );
    // Unknown variant still finds CastAndCure on the stem (playroom seed).
    expect(liveFoilMaskForBundle("me5_fr_045")).toBe("CastAndCure");
  });

  it("distingue Poké Ball vs Master Ball sur le même stem", () => {
    expect(
      liveFoilMaskForBundle("rsv10-5_de_001", { variant: "sph" }),
    ).toBe("ReverseLaminatePokeBall");
    expect(
      liveFoilMaskForBundle("rsv10-5_de_001", { variant: "mph" }),
    ).toBe("ReverseLaminateMasterBall");
    // Sans variant: ne pas inventer une plaque laminate.
    expect(liveFoilMaskForBundle("rsv10-5_de_001")).toBeNull();
  });

  it("returns null for ordinary reverse / holo stems", () => {
    expect(liveFoilMaskForBundle("bw10_fr_001", { variant: "ph" })).toBeNull();
    expect(liveFoilMaskForBundle(null)).toBeNull();
  });

  it("allume UseCCFoil sur le material SunPillar de Charkos", () => {
    const mask = liveFoilMaskForBundle("me5_fr_045", { variant: "std" });
    expect(
      paperMaterial("SunPillar", { foilMask: mask })!.floats._UseCCFoil,
    ).toBe(1);
  });

  it("isLiveFoilMaskOverride", () => {
    expect(isLiveFoilMaskOverride("CastAndCure")).toBe(true);
    expect(isLiveFoilMaskOverride("Reverse")).toBe(false);
  });
});
