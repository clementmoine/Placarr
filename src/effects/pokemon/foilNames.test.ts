import { describe, expect, it } from "vitest";

import {
  foilManifestToShader,
  isPokemonPlainPrintLeaf,
  listPokemonEffectFoilNames,
  listPokemonFoilNames,
} from "./foilNames";

describe("foilManifestToShader", () => {
  it.each([
    ["Rainbow", "Rainbow"],
    ["HoloFoil_Rainbow_Amplify_J", "Rainbow"],
    ["Standard_NonFoil_J", "NonFoil"],
    ["HoloFoil_SvHolo_Something", "SvHolo"],
    ["TPCi/Cards3D/HoloFoil/SunLava", "SunLava"],
    ["Cards/Foil/HoloFoil_FlatSilver_X", "FlatSilver"],
    ["FlatSilver_CC", "FlatSilver"],
    ["Rainbow02", "Rainbow"],
    ["SwSecreT02", "SwSecret"],
    ["HoloFoil_SWSecret_J", "SwSecret"],
    ["swsecret", "SwSecret"],
    ["HoloFoil_Cracked_Ice_Amplify_J", "CrackedIce"],
    ["PikachuFoil", "PikachuFoil"],
    ["TPCi/Cards3D/HoloFoil/PikachuFoil", "PikachuFoil"],
    ["ClassicFoil", "ClassicFoil"],
    ["RGBFoil", "RGBFoil"],
    ["Celebrations", "Celebrations"],
    ["25thConfetti", "Celebrations"],
    ["HoloFoil_25thConfetti_J", "Celebrations"],
    ["", null],
    ["UnknownFoil_XYZ", null],
  ] as const)("%s → %s", (input, expected) => {
    expect(foilManifestToShader(input)).toBe(expected);
  });
});

describe("NonFoil vs effect lists", () => {
  it("keeps NonFoil in inventory but hides it from effect pickers", () => {
    expect(listPokemonFoilNames()).toContain("NonFoil");
    expect(isPokemonPlainPrintLeaf("NonFoil")).toBe(true);
    expect(listPokemonEffectFoilNames()).not.toContain("NonFoil");
    expect(listPokemonEffectFoilNames().length).toBe(
      listPokemonFoilNames().length - 1,
    );
  });
});
