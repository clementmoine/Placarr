import { describe, expect, it } from "vitest";

import {
  aspectCorrectSquareCcUv,
  aspectCorrectSquareMotifUv,
  encodeLinearFoilOutput,
  foilCosTime,
  identityMatrixColumns,
  LIVE_CARD_ASPECT,
  restoreOpaqueFoilOutput,
  UNBOUND_TEXTURE_FALLBACK,
} from "./renderer";

describe("UNBOUND_TEXTURE_FALLBACK", () => {
  it("reste transparent (α=0) — pas noir opaque qui arme les couches CC", () => {
    expect(UNBOUND_TEXTURE_FALLBACK).toEqual([0, 0, 0, 0]);
  });
});

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

describe("aspectCorrectSquareCcUv", () => {
  it("corrige le tiling égal FlatSilver (_Tex_CC Poké Ball)", () => {
    const source = `
    u_xlat6.xy = vs_TEXCOORD0.xy * vec2(1.25, 1.25) + u_xlat6.xy;
    u_xlat16_6 = texture(_Tex_CC, u_xlat6.xy);
    u_xlat32.xy = vs_TEXCOORD0.xy * vec2(0.699999988, 0.699999988);
    u_xlat16_9.xyz = texture(_Tex_CC_Glitter, u_xlat32.xy).xyz;
`;
    const patched = aspectCorrectSquareCcUv(source);
    expect(patched).toContain(
      `vs_TEXCOORD0.xy * vec2(${1.25 * LIVE_CARD_ASPECT}, 1.25)`,
    );
    // Glitter stays Live-equal — noise, not a circle plate.
    expect(patched).toContain(
      "vs_TEXCOORD0.xy * vec2(0.699999988, 0.699999988)",
    );
  });

  it("corrige les deux samples SunPillar Northern Cross", () => {
    const source = `
    u_xlat1.xy = vs_TEXCOORD0.xy * vec2(3.0, 3.0) + u_xlat1.xy;
    u_xlat16_1.x = texture(_Tex_CC, u_xlat1.xy).x;
    u_xlat13.xz = vs_TEXCOORD0.xy * vec2(3.0, 3.0) + u_xlat13.xz;
    u_xlat16_13.x = texture(_Tex_CC, u_xlat13.xz).y;
`;
    const patched = aspectCorrectSquareCcUv(source);
    const needle = `vs_TEXCOORD0.xy * vec2(${3.0 * LIVE_CARD_ASPECT}, 3)`;
    expect(patched.split(needle)).toHaveLength(3);
  });

  it("no-op sans _Tex_CC", () => {
    const source = "vs_TEXCOORD0.xy * vec2(1.25, 1.25);";
    expect(aspectCorrectSquareCcUv(source)).toBe(source);
  });
});

describe("aspectCorrectSquareMotifUv", () => {
  it("corrige les étoiles Galaxy (vec2 + vec4)", () => {
    const source = `
    u_xlat0.xy = vs_TEXCOORD0.xy * vec2(0.5, 0.5);
    u_xlat16_0.xyz = texture(_StarsTexture, u_xlat0.xy).xyz;
    u_xlat4 = vs_TEXCOORD0.xyxy * vec4(1.5, 1.5, 1.5, 1.5) + vec4(0.1);
    u_xlat0.xy = vs_TEXCOORD0.xy * vec2(4.0, 4.0) + u_xlat0.xx;
    u_xlat0.xy = u_xlat0.xy + vec2(-0.5, -0.5);
    u_xlat16_0.xyz = texture(_T_noise_dots, u_xlat0.xy).xyz;
`;
    const patched = aspectCorrectSquareMotifUv(source);
    expect(patched).toContain(
      `vs_TEXCOORD0.xy * vec2(${0.5 * LIVE_CARD_ASPECT}, 0.5)`,
    );
    expect(patched).toContain(
      `vs_TEXCOORD0.xyxy * vec4(${1.5 * LIVE_CARD_ASPECT}, 1.5, ${1.5 * LIVE_CARD_ASPECT}, 1.5)`,
    );
    expect(patched).toContain(
      `vs_TEXCOORD0.xy * vec2(${4.0 * LIVE_CARD_ASPECT}, 4)`,
    );
  });

  it("corrige _TexDots confetti", () => {
    const source = `
    u_xlat2.xy = vs_TEXCOORD0.xy * vec2(2.0, 2.0) + u_xlat1.xx;
    u_xlat16_2.xyz = texture(_TexDots, u_xlat2.xy).xyz;
`;
    const patched = aspectCorrectSquareMotifUv(source);
    expect(patched).toContain(
      `vs_TEXCOORD0.xy * vec2(${2.0 * LIVE_CARD_ASPECT}, 2)`,
    );
  });

  it("corrige RadiantHolo even when CrossTexture is far from the scale", () => {
    const source = `
    uniform mediump sampler2D _CrossTexture;
    void main() {
      u_xlat0.xy = vs_TEXCOORD0.xy * vec2(2.0, 2.0);
      u_xlat1.x = dot(u_xlat0.xy, vec2(0.707106769, 0.707106769));
      u_xlat1.y = dot(u_xlat0.xy, vec2(-0.707106769, 0.707106769));
      u_xlat0.xy = trunc(u_xlat1.xy * vec2(35.8999977, 35.8999977));
      u_xlat16_0.xy = texture(_CrossTexture, u_xlat0.xy).xy;
    }
`;
    const patched = aspectCorrectSquareMotifUv(source);
    expect(patched).toContain(
      `vs_TEXCOORD0.xy * vec2(${2.0 * LIVE_CARD_ASPECT}, 2)`,
    );
    // Post-rotate lattice density stays Live-equal.
    expect(patched).toContain("vec2(35.8999977, 35.8999977)");
  });

  it("corrige AceFoil vec4(192,192,256,256) pour CrossTexture", () => {
    const source = `
    uniform mediump sampler2D _CrossTexture;
    u_xlat0 = vs_TEXCOORD0.xyxy * vec4(192.0, 192.0, 256.0, 256.0);
    u_xlat16_0.xy = texture(_CrossTexture, u_xlat0.xy).xy;
`;
    const patched = aspectCorrectSquareMotifUv(source);
    expect(patched).toContain(
      `vs_TEXCOORD0.xyxy * vec4(${192.0 * LIVE_CARD_ASPECT}, 192, ${256.0 * LIVE_CARD_ASPECT}, 256)`,
    );
  });

  it("corrige Squares direction grid", () => {
    const source = `
    uniform mediump sampler2D _T_Direction_RGB_Random;
    u_xlat0.xy = vs_TEXCOORD0.xy * vec2(18.0, 18.0);
    u_xlat16_0.xyz = texture(_T_Direction_RGB_Random, u_xlat0.xy).xyz;
`;
    const patched = aspectCorrectSquareMotifUv(source);
    expect(patched).toContain(
      `vs_TEXCOORD0.xy * vec2(${18.0 * LIVE_CARD_ASPECT}, 18)`,
    );
  });
});

describe("encodeLinearFoilOutput", () => {
  const source = `#version 300 es
precision highp float;
layout(location = 0) out mediump vec4 SV_Target0;
void main()
{
    SV_Target0 = vec4(0.5);
    return;
}`;

  it("enveloppe main et encode la sortie linéaire en sRGB", () => {
    const patched = encodeLinearFoilOutput(source);
    expect(patched).toContain("void foil_linear_main()");
    // Un seul vrai main — le wrapper.
    expect(patched.match(/void main\(\)/g)).toHaveLength(1);
    expect(patched).toContain("foil_linear_main();");
    // La courbe sRGB exacte, sur la variable de sortie du fragment.
    expect(patched).toContain("SV_Target0.xyz = mix(");
    expect(patched).toContain("1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055");
    // L'alpha (couverture) reste linéaire.
    expect(patched).not.toContain("SV_Target0.w =");
  });

  it("reste un no-op sans déclaration de sortie reconnue", () => {
    const bare = "void main() { }";
    expect(encodeLinearFoilOutput(bare)).toBe(bare);
  });
});

describe("identityMatrixColumns", () => {
  it("remplit les 4 colonnes depuis l'unique uniform actif name[0] (size 4)", () => {
    // GL n'expose qu'une entrée pour tout le tableau vec4[4] : n'écrire que
    // la colonne 0 laissait WorldToObject aux 3/4 nul → normalize(0) → NaN.
    expect(identityMatrixColumns(0, 4)).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);
  });

  it("couvre un déclarant partiel name[2] (size 2)", () => {
    expect(identityMatrixColumns(2, 2)).toEqual([0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it("borne les colonnes hors matrice à zéro", () => {
    expect(identityMatrixColumns(3, 2)).toEqual([0, 0, 0, 1, 0, 0, 0, 0]);
  });
});
