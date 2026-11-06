/**
 * Regression audit: Live foil_effect / MAT / frag / SHARED layers stay in sync.
 * Runs against local dump + liveFoilMasks.json when present (skip otherwise).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { restoreOpaqueFoilOutput } from "@/core/render/foil/webgl/renderer";
import { foilTextureFile } from "@/effects/foilTextureFile";
import "@/lib/foilMetaLoad.server";
import {
  packLiveFoilMasksPath,
  packMaterialSheetsPath,
} from "@/lib/packPaths";

import { listPokemonEffectFoilNames, POKEMON_FOIL_NAMES } from "./foilNames";
import { liveFoilMaskForBundle } from "./liveFoilMasks";
import {
  POKEMON_MAT_ALIASES,
  POKEMON_MATERIAL_NAMES,
  paperMaterial,
  sharedMotifStems,
} from "./materials";

const SHARED_DIR = path.join(
  process.cwd(),
  "data",
  "pokemon",
  "foil",
  "textures",
);
const SHADERS_DIR = path.join(
  process.cwd(),
  "data",
  "pokemon",
  "foil",
  "shaders",
);
const SHEETS_PATH = packMaterialSheetsPath("pokemon");
const MASKS_PATH = packLiveFoilMasksPath("pokemon");

/** Card surfaces are bound at draw time from art/etch URLs. */
const CARD_SURFACE_SLOTS = new Set([
  "_CardColorDiffuse",
  "_CardEtch",
  "_CardWhitePlateMask",
  "_CardColdFoilMask",
]);

/**
 * Intentionally unbound — FlatSilver gates CC on `_UseCCFoil` × pattern α;
 * filling with opaque black arms SVHolo2. FlatSilver_CC / ReverseLaminate*
 * bind a real plate.
 */
const INTENTIONAL_UNBOUND: Readonly<Record<string, ReadonlySet<string>>> = {
  FlatSilver: new Set(["_CCPatternTex"]),
};

const hasDump =
  existsSync(SHADERS_DIR) &&
  existsSync(SHEETS_PATH) &&
  existsSync(path.join(SHARED_DIR, "FX_T_Northern_Cross.webp"));

describe("pokemon foil layer audit", () => {
  it.skipIf(!hasDump)("every pack material has a dumped frag + sheet", () => {
    const sheets = JSON.parse(readFileSync(SHEETS_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    for (const name of POKEMON_MATERIAL_NAMES) {
      const fragStem =
        POKEMON_MAT_ALIASES[name as keyof typeof POKEMON_MAT_ALIASES] ?? name;
      expect(
        existsSync(path.join(SHADERS_DIR, `${fragStem}.frag`)),
        `missing frag ${fragStem} for ${name}`,
      ).toBe(true);
      expect(
        sheets[name] ?? sheets[fragStem],
        `missing sheet ${name}`,
      ).toBeTruthy();
      expect(paperMaterial(name)).toBeTruthy();
    }
  });

  it.skipIf(!hasDump)(
    "SHARED motifs exist on disk for every declared slot",
    () => {
      for (const name of POKEMON_MATERIAL_NAMES) {
        for (const [slot, stem] of Object.entries(sharedMotifStems(name))) {
          const webp = path.join(SHARED_DIR, foilTextureFile(stem));
          const png = path.join(SHARED_DIR, `${stem}.png`);
          expect(
            existsSync(webp) || existsSync(png),
            `${name}.${slot} → ${stem}`,
          ).toBe(true);
        }
      }
    },
  );

  it.skipIf(!hasDump)("SunPillar / FlatSilver_CC CC layers wired", () => {
    const sun = paperMaterial("SunPillar")!;
    expect(sun.textures._CCPatternTex?.file).toContain("FX_T_Northern_Cross");
    expect(sun.floats._UseCCFoil).toBe(0);
    expect(
      paperMaterial("SunPillar", { foilMask: "CastAndCure" })!.floats
        ._UseCCFoil,
    ).toBe(1);

    const cc = paperMaterial("FlatSilver_CC")!;
    expect(cc.fragment).toBe("FlatSilver.frag");
    expect(cc.textures._CCPatternTex?.file).toContain("TEX_CC_PB");
    expect(cc.floats._UseCCFoil).toBe(1);
  });

  it.skipIf(!hasDump)(
    "every frag sampler is bound (except intentional CC gaps)",
    () => {
      const samplerRe =
        /uniform\s+(?:mediump\s+)?sampler2D\s+(\w+)\s*;/g;
      const unbound: string[] = [];
      for (const name of POKEMON_MATERIAL_NAMES) {
        const mat = paperMaterial(name);
        if (!mat?.fragment) continue;
        const fragPath = path.join(SHADERS_DIR, mat.fragment);
        if (!existsSync(fragPath)) continue;
        const src = readFileSync(fragPath, "utf8");
        const allow = INTENTIONAL_UNBOUND[name] ?? new Set();
        for (const m of src.matchAll(samplerRe)) {
          const slot = m[1]!;
          if (CARD_SURFACE_SLOTS.has(slot) || allow.has(slot)) continue;
          if (!mat.textures[slot]) unbound.push(`${name}.${slot}`);
        }
      }
      expect(unbound, unbound.join("\n")).toEqual([]);
    },
  );

  it.skipIf(!hasDump)(
    "prepareFragment forces opaque SV_Target0 (Unity RT ignored α)",
    () => {
      /*
        Live HoloFoil is a *single* GLES pass that composites art + whiteplate
        + etch + motifs into an opaque Unity RT. FlatSilver/SvUltra dumps still
        write `SV_Target0.w = 0.0` — fine on an opaque target, invisible when
        the same frag feeds a WebGL canvas composited over the page.
      */
      const translucent: string[] = [];
      for (const name of readdirSync(SHADERS_DIR)) {
        if (!name.endsWith(".frag")) continue;
        const raw = readFileSync(path.join(SHADERS_DIR, name), "utf8");
        const prepared = restoreOpaqueFoilOutput(raw);
        const matches = [
          ...prepared.matchAll(/SV_Target0\.w\s*=\s*([^;]+);/g),
        ];
        const last = matches.at(-1)?.[1]?.trim();
        if (last !== "1.0" && last !== "1") {
          translucent.push(`${name}: w=${last ?? "missing"}`);
        }
      }
      expect(translucent, translucent.join("\n")).toEqual([]);
    },
  );

  it.skipIf(!existsSync(MASKS_PATH))(
    "liveFoilMasks keys are bundle::variant (no stem collisions)",
    () => {
      const map = JSON.parse(readFileSync(MASKS_PATH, "utf8")) as Record<
        string,
        string
      >;
      const keys = Object.keys(map);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(key.includes("::"), key).toBe(true);
      }
      // Spot-check against whatever CastAndCure entry the local dump has.
      const castKey = keys.find((k) => map[k] === "CastAndCure");
      if (castKey) {
        const [stem, variant] = castKey.split("::");
        expect(
          liveFoilMaskForBundle(stem, { variant }),
        ).toBe("CastAndCure");
      }
      // Laminate siblings must not overwrite each other when both present.
      const sph = liveFoilMaskForBundle("rsv10-5_de_001", { variant: "sph" });
      const mph = liveFoilMaskForBundle("rsv10-5_de_001", { variant: "mph" });
      if (sph || mph) {
        expect(sph).toBe("ReverseLaminatePokeBall");
        expect(mph).toBe("ReverseLaminateMasterBall");
      }
    },
  );

  it("pack lists every foil leaf + MAT aliases", () => {
    for (const name of listPokemonEffectFoilNames()) {
      expect(POKEMON_MATERIAL_NAMES).toContain(name);
    }
    for (const alias of Object.keys(POKEMON_MAT_ALIASES)) {
      expect(POKEMON_MATERIAL_NAMES).toContain(alias);
    }
  });
});
