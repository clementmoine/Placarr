import { describe, expect, it } from "vitest";

import { foilCosTime, restoreOpaqueFoilOutput } from "./renderer";

describe("foilCosTime", () => {
  it("suit la formule Unity (cos t/8, t/4, t/2, t)", () => {
    const t = Math.PI / 3;
    const [a, b, c, d] = foilCosTime(t);
    expect(a).toBeCloseTo(Math.cos(t / 8));
    expect(b).toBeCloseTo(Math.cos(t / 4));
    expect(c).toBeCloseTo(Math.cos(t / 2));
    expect(d).toBeCloseTo(Math.cos(t));
  });
});

describe("restoreOpaqueFoilOutput", () => {
  it("remet une couleur opaque à la place de l'encodage α=1/255 Unity", () => {
    const source = `
    u_xlat0.w = 0.00392156886;
    u_xlat1.xyz = vs_INTERP2.xyz;
    u_xlat0 = u_xlat0 * u_xlat1;
    SV_TARGET0.xyz = u_xlat0.www * u_xlat0.xyz;
    SV_TARGET0.w = u_xlat0.w;
    return;
}`;
    const patched = restoreOpaqueFoilOutput(source);
    expect(patched).toContain("SV_TARGET0.xyz = u_xlat0.xyz;");
    expect(patched).toContain("SV_TARGET0.w = 1.0;");
    expect(patched).not.toContain("u_xlat0.www * u_xlat0.xyz");
  });

  it("laisse intact un fragment sans cet encodage", () => {
    const source = "SV_TARGET0 = vec4(1.0);";
    expect(restoreOpaqueFoilOutput(source)).toBe(source);
  });
});
