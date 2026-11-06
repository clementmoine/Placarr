/**
 * Per-frag tilt-driver audit — catches the class of bug where Placarr moved
 * `_LightDirection` / camera but left the Live Card mesh TBN flat.
 *
 * First WebGL audits checked textures + light/camera and missed AceFoil-class
 * leaves: MAT `_ShadowDarknessLimit >= 1` kills N·L, so lattice/spectrum is
 * driven by `WorldToObject · N` → TBN dots. Without `u_CardLean` those look frozen.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { packMaterialSheetsPath } from "@/lib/packPaths";

import { aceFoilNormalLatticeOffset } from "./lightDirection";
import { alignFragmentVaryings } from "./renderer";

const SHADERS_DIR = path.join(
  process.cwd(),
  "data",
  "pokemon",
  "foil",
  "shaders",
);
const LORCANA_SHADERS_DIR = path.join(
  process.cwd(),
  "data",
  "lorcana",
  "foil",
  "shaders",
);
const SHEETS_PATH = packMaterialSheetsPath("pokemon");
const RENDERER_PATH = path.join(
  process.cwd(),
  "src",
  "core",
  "render",
  "foil",
  "webgl",
  "renderer.ts",
);

const hasDump = existsSync(SHADERS_DIR) && existsSync(SHEETS_PATH);

type FragDrivers = {
  stem: string;
  usesLight: boolean;
  usesCamera: boolean;
  usesTbnRows: boolean;
  usesTiltUniform: boolean;
  shadowLimit: number | null;
  lightDead: boolean;
};

function classifyFrag(
  stem: string,
  source: string,
  floats: Record<string, number> | undefined,
): FragDrivers {
  const sdl = floats?._ShadowDarknessLimit;
  const usesLight = source.includes("_LightDirection");
  const lightDead = usesLight && sdl !== undefined && Number(sdl) >= 1 - 1e-9;
  return {
    stem,
    usesLight,
    usesCamera: source.includes("_WorldSpaceCameraPos"),
    usesTbnRows: /vs_TEXCOORD[123]\.xyz/.test(source),
    usesTiltUniform: /\b_Tilt\b/.test(source),
    shadowLimit: sdl === undefined ? null : Number(sdl),
    lightDead,
  };
}

describe("Live HoloFoil tilt drivers", () => {
  it.skipIf(!hasDump)(
    "no Live frag reads _Tilt — lean must come from light/camera/TBN",
    () => {
      for (const name of readdirSync(SHADERS_DIR)) {
        if (!name.endsWith(".frag")) continue;
        const src = readFileSync(path.join(SHADERS_DIR, name), "utf8");
        expect(src, name).not.toMatch(/\b_Tilt\b/);
      }
    },
  );

  it.skipIf(!hasDump)(
    "SDL≥1 leaves cannot rely on light lean alone (TBN or camera required)",
    () => {
      const sheets = JSON.parse(readFileSync(SHEETS_PATH, "utf8")) as Record<
        string,
        { floats?: Record<string, number> }
      >;
      const risky: string[] = [];
      for (const name of readdirSync(SHADERS_DIR)) {
        if (!name.endsWith(".frag")) continue;
        const stem = name.replace(/\.frag$/i, "");
        const src = readFileSync(path.join(SHADERS_DIR, name), "utf8");
        const d = classifyFrag(stem, src, sheets[stem]?.floats);
        if (!d.lightDead && !(d.usesTbnRows && !d.usesLight)) continue;
        // Light is a no-op (or absent): need another lean path.
        if (!d.usesTbnRows && !d.usesCamera) risky.push(stem);
      }
      expect(risky, `no lean path: ${risky.join(", ")}`).toEqual([]);
    },
  );

  it.skipIf(!hasDump)(
    "most Live leaves sample TBN rows — mesh lean is not optional",
    () => {
      const stems = readdirSync(SHADERS_DIR)
        .filter((n) => n.endsWith(".frag"))
        .map((n) => n.replace(/\.frag$/i, ""));
      const withTbn = stems.filter((stem) => {
        const src = readFileSync(
          path.join(SHADERS_DIR, `${stem}.frag`),
          "utf8",
        );
        return /vs_TEXCOORD[123]\.xyz/.test(src);
      });
      // Flat audit: nearly every leaf — if this ratio collapses, dump changed.
      expect(withTbn.length).toBeGreaterThanOrEqual(stems.length - 2);
    },
  );

  it("AceFoil-class lattice offset moves when TBN tips with lean", () => {
    const rest = aceFoilNormalLatticeOffset(0, 0);
    const tipped = aceFoilNormalLatticeOffset(1, 0);
    expect(rest).toBeCloseTo(0.5, 5);
    expect(Math.abs(tipped - rest)).toBeGreaterThan(0.05);
  });

  it("WebGL VS binds u_CardLean (TBN tip) — not only light/camera uniforms", () => {
    const src = readFileSync(RENDERER_PATH, "utf8");
    expect(src).toMatch(/uniform vec2 u_CardLean/);
    expect(src).toMatch(/cardLeanLoc/);
    expect(src).toMatch(/uniform2f\(active\.cardLeanLoc/);
  });
});

/**
 * Catch FlatSilver-class link failures early: every dump `in` must match the
 * shared VS `out` name+type after {@link alignFragmentVaryings}.
 */
describe("WebGL fragment ↔ shared VS varyings", () => {
  function parseVsOuts(rendererSrc: string): Map<string, string> {
    const block = /const VERTEX_SRC = `([\s\S]*?)`;/.exec(rendererSrc)?.[1];
    expect(block, "VERTEX_SRC block").toBeTruthy();
    const outs = new Map<string, string>();
    for (const m of block!.matchAll(
      /\bout\s+(?:highp|mediump|lowp)?\s*(vec[234]|float)\s+(\w+)\s*;/g,
    )) {
      outs.set(m[2]!, m[1]!);
    }
    return outs;
  }

  function parseFragIns(source: string): Map<string, string> {
    const aligned = alignFragmentVaryings(source);
    const ins = new Map<string, string>();
    for (const m of aligned.matchAll(
      /^\s*in\s+(?:highp|mediump|lowp)?\s*(vec[234]|float)\s+(\w+)\s*;/gm,
    )) {
      ins.set(m[2]!, m[1]!);
    }
    return ins;
  }

  function assertDirCompatible(dir: string, vsOuts: Map<string, string>) {
    expect(existsSync(dir), dir).toBe(true);
    const problems: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".frag")) continue;
      const ins = parseFragIns(readFileSync(path.join(dir, name), "utf8"));
      for (const [vary, typ] of ins) {
        const vsTyp = vsOuts.get(vary);
        if (!vsTyp) problems.push(`${name}: missing VS out ${vary}`);
        else if (vsTyp !== typ) {
          problems.push(`${name}: ${vary} frag=${typ} vs=${vsTyp}`);
        }
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  }

  it("pokemon + lorcana dumps link against shared VERTEX_SRC types", () => {
    const vsOuts = parseVsOuts(readFileSync(RENDERER_PATH, "utf8"));
    expect(vsOuts.get("vs_TEXCOORD0")).toBe("vec2");
    expect(vsOuts.get("vs_NORMAL0")).toBe("vec3");
    expect(vsOuts.get("vs_TEXCOORD4")).toBe("vec4");
    expect(vsOuts.get("vs_INTERP0")).toBe("vec4");

    if (existsSync(SHADERS_DIR)) assertDirCompatible(SHADERS_DIR, vsOuts);
    if (existsSync(LORCANA_SHADERS_DIR)) {
      assertDirCompatible(LORCANA_SHADERS_DIR, vsOuts);
    }
  });

  it.skipIf(!existsSync(SHADERS_DIR))(
    "FlatSilver / SvUltra vec4 TEXCOORD0 is aligned before link",
    () => {
      for (const stem of ["FlatSilver", "SvUltra"]) {
        const raw = readFileSync(path.join(SHADERS_DIR, `${stem}.frag`), "utf8");
        expect(raw).toMatch(/in\s+highp\s+vec4\s+vs_TEXCOORD0/);
        expect(alignFragmentVaryings(raw)).toMatch(
          /in highp vec2 vs_TEXCOORD0;/,
        );
      }
    },
  );

  it("prepareFragment pipeline keeps every dump linkable (static)", async () => {
    const {
      restoreOpaqueFoilOutput,
      aspectCorrectSquareMotifUv,
      encodeLinearFoilOutput,
    } = await import("./renderer");
    const prepare = (source: string, linear: boolean) => {
      const aligned = alignFragmentVaryings(source);
      const opaque = restoreOpaqueFoilOutput(aligned);
      const isotropic = aspectCorrectSquareMotifUv(opaque);
      return linear ? encodeLinearFoilOutput(isotropic) : isotropic;
    };
    const problems: string[] = [];
    for (const [dir, linear] of [
      [SHADERS_DIR, true],
      [LORCANA_SHADERS_DIR, false],
    ] as const) {
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".frag")) continue;
        const out = prepare(
          readFileSync(path.join(dir, name), "utf8"),
          linear,
        );
        if (!out.includes("#version 300 es")) {
          problems.push(`${name}: lost #version`);
        }
        if (!/void\s+main\s*\(/.test(out)) {
          problems.push(`${name}: lost main`);
        }
        if (/in\s+highp\s+vec4\s+vs_TEXCOORD0/.test(out)) {
          problems.push(`${name}: TEXCOORD0 still vec4`);
        }
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
