import { describe, expect, it } from "vitest";

import { adaptClientFragment } from "@/lib/unity/webglAdapt";

const SAMPLE = `#version 300 es
precision highp float;
struct FGlobals_Type
{
    vec4 _TimeParameters;
    vec3 _WorldSpaceCameraPos;
};
struct UnityPerMaterial_Type
{
    vec4 _Color;
    float _Interval;
};
uniform FGlobals_Type FGlobals;
uniform UnityPerMaterial_Type UnityPerMaterial;
uniform sampler2D _Mask;
uniform sampler2DArray _FrameTex;
in vec4 INTERP0;
in vec4 INTERP1;
in vec3 INTERP2;
in vec3 INTERP3;
out vec4 fragColor;
void main() {
  fragColor = texture(_Mask, INTERP0.xy, 0.0) * INTERP1;
  fragColor.xyz += texture(_FrameTex, vec3(INTERP0.xy, 0.0)).xyz;
  fragColor.xyz *= UnityPerMaterial._Color.xyz * FGlobals._TimeParameters.x;
  fragColor.xyz += INTERP3 + INTERP2 + FGlobals._WorldSpaceCameraPos;
}
`;

describe("adaptClientFragment", () => {
  const glsl = adaptClientFragment(SAMPLE);

  it("flattens buffer structs onto names the foil renderer already drives", () => {
    expect(glsl).not.toContain("struct ");
    expect(glsl).not.toContain("FGlobals");
    expect(glsl).not.toContain("UnityPerMaterial");
    expect(glsl).toContain("uniform vec4 _Time;");
    expect(glsl).toContain("uniform vec3 _WorldSpaceCameraPos;");
    expect(glsl).toContain("uniform vec4 _Color;");
    expect(glsl).toContain("_Time.x");
  });

  it("reads the shared quad varyings and keeps a white vertex colour", () => {
    expect(glsl).toContain("in vec4 vs_INTERP0;");
    expect(glsl).toContain("in vec3 vs_NORMAL0;");
    expect(glsl).toContain("in vec4 vs_TEXCOORD4;");
    expect(glsl).toContain("texture(_Mask, vs_INTERP0.xy, 0.0)");
    expect(glsl).toContain("vec4 INTERP1 = vec4(1.0);");
    expect(glsl).toContain("vec3 INTERP2 = vs_TEXCOORD4.xyz;");
    expect(glsl).toContain("vec3 INTERP3 = vs_NORMAL0;");
    expect(glsl).not.toContain("in vec4 INTERP0");
  });

  it("samples a demoted array as a 2D plate", () => {
    expect(glsl).toContain("uniform sampler2D _FrameTex;");
    expect(glsl).not.toContain("sampler2DArray");
    expect(glsl).toContain("texture(_FrameTex, (vec3(vs_INTERP0.xy, 0.0)).xy)");
  });

  it("turns Metal vector compares into GLSL equal and component or", () => {
    const repaired = adaptClientFragment(`#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  bvec4 u_xlatb5;
  bvec4 u_xlatb6;
  vec4 hlslcc_FragCoord = vec4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
  u_xlatb5.xyz = (vec3(_DistortionChannels)==vec3(1.0, 3.0, 2.0));
  u_xlatb5.xy = u_xlatb5.yy || u_xlatb5.xz;
  u_xlatb6 = (vec2(0.0, 0.0)!=vec2(_UseFront, _Vignette));
  u_xlatu71 = _FrontTex.get_num_mip_levels();
  fragColor = vec4(0.0);
}
`);
    expect(repaired).toContain("gl_FragCoord");
    expect(repaired).not.toContain("mtl_FragCoord");
    expect(repaired).toContain("equal(vec3(_DistortionChannels), vec3(1.0, 3.0, 2.0))");
    expect(repaired).toContain("notEqual(vec2(0.0, 0.0), vec2(_UseFront, _Vignette))");
    expect(repaired).toContain("bvec2(u_xlatb5.y||u_xlatb5.x, u_xlatb5.y||u_xlatb5.z)");
    expect(repaired).toContain("1u");
    expect(repaired).not.toContain("get_num_mip_levels");
  });

  it("packs Frost EffectsLayers into sampler2DArray and drops cubemap/distortion", () => {
    const many = `#version 300 es
precision highp float;
uniform sampler2D _CubemapAsset_x;
uniform sampler2D _MainTex;
uniform sampler2D _FrontTex;
uniform sampler2D _MiddleTex;
uniform sampler2D _CharaTex;
uniform sampler2D _MasksTex;
uniform sampler2D _FoilMask;
uniform sampler2D _HoloMask;
uniform sampler2D _HoloMap;
uniform sampler2D _RainbowTexture;
uniform sampler2D _FrameTex;
uniform sampler2D _Frame2Tex;
uniform sampler2D _DistortionTexture;
uniform sampler2D _DistortionMask;
uniform sampler2D _EffectsLayer1Tex;
uniform sampler2D _EffectsLayer1Motion;
uniform sampler2D _EffectsLayer2Tex;
uniform sampler2D _EffectsLayer3Tex;
uniform sampler2D _LeaderIconMask;
uniform sampler2D _CostNumberTex;
out vec4 fragColor;
void main() {
  fragColor = textureLod(_EffectsLayer1Tex, vec2(0.5), 0.0);
  fragColor += textureLod(_EffectsLayer3Tex, vec2(0.25), 0.0);
  fragColor += textureLod(_MainTex, vec2(0.5), 0.0);
  fragColor += textureLod(_CubemapAsset_x, vec3(0.5), 0.0);
  fragColor += textureLod(_DistortionTexture, vec2(0.5), 0.0);
}
`;
    const adapted = adaptClientFragment(many);
    expect(adapted).toContain("uniform sampler2DArray _EffectsLayersTex;");
    expect(adapted).toContain("uniform sampler2DArray _EffectsLayersMotion;");
    // `#version` must stay first — prepending array uniforms breaks compile.
    expect(adapted.trimStart().startsWith("#version")).toBe(true);
    expect(adapted).toContain("precision highp sampler2DArray;");
    expect(adapted.indexOf("#version")).toBeLessThan(
      adapted.indexOf("uniform sampler2DArray _EffectsLayersTex"),
    );
    expect(adapted).toContain(
      "textureLod(_EffectsLayersTex, vec3((vec2(0.5)).xy, 0.0)",
    );
    expect(adapted).toContain(
      "textureLod(_EffectsLayersTex, vec3((vec2(0.25)).xy, 2.0)",
    );
    expect(adapted).not.toContain("uniform sampler2D _EffectsLayer1Tex;");
    expect(adapted).not.toContain("uniform sampler2D _DistortionTexture;");
    expect(adapted).not.toContain("uniform sampler2D _CubemapAsset_x;");
    // Dropped cubemap samples must stub white — black zeros crush Frost holo.
    expect(adapted).toContain("fragColor += vec4(1.0);");
    expect(adapted).toContain("fragColor += vec4(0.0);");
  });
});
