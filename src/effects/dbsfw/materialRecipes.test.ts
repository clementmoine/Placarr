import { describe, expect, it } from "vitest";

import {
  DBS_FW_MATERIAL_RECIPES,
  dbsFwMaterialRecipe,
} from "./materialRecipes";

describe("dbsFw material recipes (Unity dump truth)", () => {
  it("Card Foil_holo: FoilType=2, COUNT=0, shadow on", () => {
    const r = dbsFwMaterialRecipe("foil-holo");
    expect(r?.unityMaterial).toBe("Card Foil_holo");
    expect(r?.keywords).toContain("EFFECTS_LAYER_COUNT_ZERO");
    expect(r?.floats._FoilType).toBe(2);
    expect(r?.floats._FoilShadow).toBe(1);
    expect(r?.floats._HoloFoilEnabled).toBe(1);
    expect(r?.floats.EFFECTS_LAYER_COUNT).toBe(0);
    expect(r?.floats._RainbowScale).toBe(2);
    expect(r?.holo).toBe("covers");
  });

  it("Card Tabac_holo: COUNT=1, motion speed 3, FoilType=0", () => {
    const r = dbsFwMaterialRecipe("tabac-holo");
    expect(r?.unityMaterial).toBe("Card Tabac_holo");
    expect(r?.keywords).toContain("EFFECTS_LAYER_COUNT_ONE");
    expect(r?.floats.EFFECTS_LAYER_COUNT).toBe(1);
    expect(r?.floats._EffectsLayer1MotionSpeed).toBe(3);
    expect(r?.floats._FoilType).toBe(0);
    expect(r?.floats._FoilShadow).toBe(0);
    // Foil_holo dumps Layer1Color at 0 — Tabac must override or the layer dies.
    expect(r?.colors?._EffectsLayer1Color?.[3]).toBeGreaterThan(0);
  });

  it("effects-uv-rainbow: FB02-036 COUNT_FIVE stack, Holo off", () => {
    const r = dbsFwMaterialRecipe("effects-uv-rainbow");
    expect(r?.floats.EFFECTS_LAYER_COUNT).toBe(5);
    expect(r?.keywords).toContain("EFFECTS_LAYER_COUNT_FIVE");
    expect(r?.floats._HoloFoilEnabled).toBe(0);
    expect(r?.colors?._EffectsLayer1Color?.[0]).toBeGreaterThan(2);
    expect(r?.floats._EffectsLayer1MotionSpeed).toBe(6);
    expect(r?.floats._EffectsLayer5Rotation).toBe(50);
    expect(r?.floats._FoilType).toBe(0);
  });

  it("Card Variant Energy_holo: map plate, RainbowScale=4", () => {
    const r = dbsFwMaterialRecipe("energy-holo");
    expect(r?.unityMaterial).toBe("Card Variant Energy_holo");
    expect(r?.holo).toBe("map");
    expect(r?.floats._RainbowScale).toBe(4);
    expect(r?.floats.EFFECTS_LAYER_COUNT).toBe(0);
  });

  it("Card base: holo off", () => {
    const r = dbsFwMaterialRecipe("card");
    expect(r?.holo).toBe(false);
    expect(r?.floats._HoloFoilEnabled).toBe(0);
    expect(r?.floats._FoilType).toBe(0);
  });

  it("pakipaki / championship gates are explicit floats", () => {
    expect(dbsFwMaterialRecipe("pakipaki")?.floats._FoilPakipaki).toBe(1);
    expect(
      dbsFwMaterialRecipe("card-hologram")?.floats._ChampionshipHologram,
    ).toBe(1);
  });

  it("every recipe leaf has a stable profile", () => {
    for (const [id, recipe] of Object.entries(DBS_FW_MATERIAL_RECIPES)) {
      expect(recipe.profile, id).toBeTruthy();
      expect(Array.isArray(recipe.keywords), id).toBe(true);
    }
  });
});
