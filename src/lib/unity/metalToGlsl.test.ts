import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { iterClassTrees, loadUnityFs } from "@/lib/unity/loadUnityFs";
import { metalSourcesFromBlob } from "@/lib/unity/metalBlob";
import { translateMetalSource } from "@/lib/unity/metalToGlsl";
import {
  decompressPlatformBlobs,
  extractShaderFragsFromBytes,
  type ShaderTypeTree,
} from "@/lib/unity/shader";

const SAMPLE = `#include <metal_stdlib>
#include <metal_texture>
using namespace metal;
struct FGlobals_Type
{
    float4 _Color;
};
struct Mtl_FragmentIn
{
    float4 INTERP0 [[ user(INTERP0) ]] ;
};
struct Mtl_FragmentOut
{
    float4 SV_TARGET0 [[ color(0) ]];
};
fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_Mask [[ sampler(0) ]],
    texture2d<float, access::sample > _Mask [[ texture(0) ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    bool u_xlatb0;
    u_xlat0 = _Mask.sample(sampler_Mask, input.INTERP0.xy, bias(1.0));
    u_xlat0 = select(float4(0.0, 0.0, 0.0, 0.0), u_xlat0, bool4(u_xlat0.x > 0.0));
    u_xlat0.x = fma(u_xlat0.x, 2.0, 1.0);
    u_xlat0.x = rsqrt(u_xlat0.x);
    u_xlat0.x = saturate(u_xlat0.x);
    u_xlatb0 = u_xlat0.x == 0.0;
    if (u_xlatb0) { discard_fragment(); }
    output.SV_TARGET0 = u_xlat0 * FGlobals._Color;
    return output;
}
`;

const VERTEX = `#include <metal_stdlib>
using namespace metal;
struct VGlobals_Type
{
    float4 hlslcc_mtx4x4unity_MatrixVP[4];
};
struct Mtl_VertexIn
{
    float3 POSITION0 [[ attribute(0) ]] ;
};
struct Mtl_VertexOut
{
    float4 mtl_Position [[ position ]];
};
vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    output.mtl_Position = VGlobals.hlslcc_mtx4x4unity_MatrixVP[0] * input.POSITION0.x;
    return output;
}
`;

function packBlob(sources: string[]): Uint8Array {
  const segments = sources.map((source) => {
    const bytes = new TextEncoder().encode(`${source}\0`);
    return bytes;
  });
  const count = segments.length;
  const header = 4 + count * 12;
  let cursor = header;
  const placed = segments.map((segment) => {
    const at = cursor;
    cursor += segment.byteLength;
    return { at, segment };
  });
  const out = new Uint8Array(cursor);
  const view = new DataView(out.buffer);
  view.setUint32(0, count, true);
  placed.forEach((item, index) => {
    view.setUint32(4 + index * 12, item.at, true);
    view.setUint32(8 + index * 12, item.segment.byteLength, true);
    view.setUint32(12 + index * 12, 0, true);
    out.set(item.segment, item.at);
  });
  return out;
}

const FORBIDDEN = [
  "[[",
  "#include <metal",
  ".sample(",
  "float4",
  "discard_fragment",
  "fma(",
  "rsqrt(",
  "saturate(",
  "select(",
  "as_type",
  "texture2d",
  "texturecube",
  "using namespace",
  "mtl_Position",
  "SV_TARGET",
  "input.",
  "output.",
];

function assertGlsl(glsl: string): void {
  for (const token of FORBIDDEN) {
    expect(glsl, token).not.toContain(token);
  }
  expect(glsl.startsWith("#version 300 es")).toBe(true);
  expect(glsl).toContain("void main()");
}

const GAME_BUNDLE = join(
  homedir(),
  "Library/Application Support/DBSCG FW/Games/DRAGON BALL SUPER CARD GAME FUSION WORLD/default/game/DBSCGFW.app/Contents/Resources/Data/StreamingAssets/aa/StandaloneOSX/packdata_assets_shader.bundle",
);

describe("metal to glsl", () => {
  it("reads a Metal source back out of a Unity segment table", () => {
    const programs = metalSourcesFromBlob(packBlob([SAMPLE, VERTEX]));
    expect(programs.map((program) => program.stage)).toEqual(["fragment", "vertex"]);
    expect(programs[0]?.source).toContain("_Mask.sample");
  });

  it("maps a fragment's sample, select, fma and discard to GLSL ES 3.00", () => {
    const glsl = translateMetalSource(SAMPLE)?.glsl ?? "";
    assertGlsl(glsl);
    expect(glsl).toContain("uniform sampler2D _Mask;");
    expect(glsl).toContain("uniform FGlobals_Type FGlobals;");
    expect(glsl).toContain("in vec4 INTERP0;");
    expect(glsl).toContain("out vec4 fragColor;");
    expect(glsl).toContain("texture(_Mask, INTERP0.xy, 1.0)");
    expect(glsl).toContain("mix(vec4(0.0, 0.0, 0.0, 0.0), u_xlat0, vec4(bvec4(u_xlat0.x > 0.0)))");
    expect(glsl).toContain("((u_xlat0.x)*(2.0)+(1.0))");
    expect(glsl).toContain("inversesqrt(");
    expect(glsl).toContain("clamp(");
    expect(glsl).toContain("discard;");
    expect(glsl).toContain("fragColor = u_xlat0 * FGlobals._Color;");
  });

  it("maps a vertex stage_in position to gl_Position", () => {
    const translated = translateMetalSource(VERTEX);
    expect(translated?.stage).toBe("vertex");
    assertGlsl(translated?.glsl ?? "");
    expect(translated?.glsl).toContain("in vec3 POSITION0;");
    expect(translated?.glsl).toContain("gl_Position = VGlobals.hlslcc_mtx4x4unity_MatrixVP[0] * POSITION0.x;");
  });

  describe("Fusion World player shaders", () => {
    const bundle = existsSync(GAME_BUNDLE) ? readFileSync(GAME_BUNDLE) : null;

    it.skipIf(!bundle)("translates UIHologram and Frost/Card into the shader pipeline", () => {
      const frags = extractShaderFragsFromBytes(bundle!, {
        resolveName: (input) => {
          if (input.parsedName === "Shader Graphs/UIHologram") return "UIHologram";
          if (input.parsedName === "Frost/Card") return "FrostCard";
          return null;
        },
      });
      const byName = new Map(frags.map((frag) => [frag.foil, frag.frag]));
      const hologram = byName.get("UIHologram") ?? "";
      const card = byName.get("FrostCard") ?? "";
      assertGlsl(hologram);
      assertGlsl(card);
      expect(hologram).toContain("uniform sampler2D _Mask;");
      expect(hologram).toContain("texture(_Mask,");
      expect(hologram).toContain("discard;");
      expect(card).toContain("HoloMap");
      expect(card).toContain("texture(");
      expect(card).toContain("fragColor");

      const loaded = loadUnityFs(bundle!);
      for (const tree of iterClassTrees(loaded, 48)) {
        const name = (tree as ShaderTypeTree).m_ParsedForm?.m_Name;
        if (name !== "Frost/Card") continue;
        const data = decompressPlatformBlobs(tree).find((chunk) => chunk.data.length > 0)?.data;
        const programs = metalSourcesFromBlob(data ?? new Uint8Array());
        expect(programs.filter((program) => program.stage === "fragment").length).toBe(82);
        const vertex = programs.find((program) => program.stage === "vertex");
        const vertGlsl = translateMetalSource(vertex?.source ?? "")?.glsl ?? "";
        assertGlsl(vertGlsl);
        expect(vertGlsl).toContain("gl_Position");
      }
    });
  });
});
