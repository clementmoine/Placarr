/**
 * Regression audit: Live foil_effect / MAT / frag / SHARED layers stay in sync.
 * Runs against local dump + liveFoilMasks.json when present (skip otherwise).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { foilTextureFile } from "@/effects/foilTextureFile";

import { POKEMON_FOIL_NAMES } from "./foilNames";
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
const SHADERS_DIR = path.join(process.cwd(), "data", "pokemon", "foil", "shaders");
const SHEETS_PATH = path.join(
  process.cwd(),
  "src",
  "effects",
  "pokemon",
  "materialSheets.json",
);
const MASKS_PATH = path.join(
  process.cwd(),
  "src",
  "effects",
  "pokemon",
  "liveFoilMasks.json",
);

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
      expect(sheets[name] ?? sheets[fragStem], `missing sheet ${name}`).toBeTruthy();
      expect(paperMaterial(name)).toBeTruthy();
    }
  });

  it.skipIf(!hasDump)("SHARED motifs exist on disk for every declared slot", () => {
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
  });

  it.skipIf(!hasDump)("SunPillar / FlatSilver_CC CC layers wired", () => {
    const sun = paperMaterial("SunPillar")!;
    expect(sun.textures._Tex_CC?.file).toContain("FX_T_Northern_Cross");
    expect(sun.floats._UseCCFoil).toBe(0);
    expect(
      paperMaterial("SunPillar", { foilMask: "CastAndCure" })!.floats
        ._UseCCFoil,
    ).toBe(1);

    const cc = paperMaterial("FlatSilver_CC")!;
    expect(cc.fragment).toBe("FlatSilver.frag");
    expect(cc.textures._Tex_CC?.file).toContain("TEX_CC_PB");
    expect(cc.floats._UseCCFoil).toBe(1);
  });

  it.skipIf(!existsSync(MASKS_PATH))(
    "liveFoilMasks keys are bundle::variant (no stem collisions)",
    () => {
      const map = JSON.parse(readFileSync(MASKS_PATH, "utf8")) as Record<
        string,
        string
      >;
      for (const key of Object.keys(map)) {
        expect(key.includes("::"), key).toBe(true);
      }
      expect(liveFoilMaskForBundle("me5_fr_045", { variant: "std" })).toBe(
        "CastAndCure",
      );
      // Laminate siblings must not overwrite each other.
      const sph = liveFoilMaskForBundle("rsv10-5_de_001", { variant: "sph" });
      const mph = liveFoilMaskForBundle("rsv10-5_de_001", { variant: "mph" });
      if (sph || mph) {
        expect(sph).toBe("ReverseLaminatePokeBall");
        expect(mph).toBe("ReverseLaminateMasterBall");
      }
    },
  );

  it("pack lists every foil leaf + MAT aliases", () => {
    for (const name of POKEMON_FOIL_NAMES) {
      expect(POKEMON_MATERIAL_NAMES).toContain(name);
    }
    for (const alias of Object.keys(POKEMON_MAT_ALIASES)) {
      expect(POKEMON_MATERIAL_NAMES).toContain(alias);
    }
  });
});
