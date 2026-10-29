import { describe, expect, it } from "vitest";

import {
  isUnityOnlyVarnish,
  parseMaterialName,
  resolveMaterialName,
} from "./resolveMaterial";

describe("isUnityOnlyVarnish", () => {
  it.each([
    ["VarnishFoil", true],
    ["varnishfoil", true],
    ["HighGloss", false],
    ["RainbowHotFoil", false],
  ] as const)("%s → %s", (token, expected) => {
    expect(isUnityOnlyVarnish(token)).toBe(expected);
  });
});

describe("parseMaterialName", () => {
  it.each([
    ["CardFoilLava", { finish: "Lava", varnish: null }],
    ["CardFoilVertWave", { finish: "VerticalWave", varnish: null }],
    ["CardFreeForm2VarnishFoil", { finish: "FreeForm2", varnish: "VarnishFoil" }],
    [
      "CardFreeForm2RainbowHotFoil",
      { finish: "FreeForm2", varnish: "RainbowHotFoil" },
    ],
    [
      "CardTinselChromeRainbowHotFoilMaterial",
      { finish: "Tinsel", varnish: "ChromeRainbowHotFoil" },
    ],
  ] as const)("%s → finish/varnish", (name, expected) => {
    expect(parseMaterialName(name)).toEqual(expected);
  });
});

describe("resolveMaterialName", () => {
  it.each([
    ["Magma", "MetallicHotFoil", "CardMagmaMetallicHotFoil"],
    ["Magma", null, "CardMagmaFoil"],
    ["Silver", null, "CardFoilSilver"],
    ["VerticalWave", null, "CardFoilVertWave"],
    ["SeaWave", "HighGloss", "CardFoilSeaWaveHighGloss"],
    ["Lore", "MetallicHotFoil", "CardLoreMetallicHotFoil"],
    ["FreeForm2", "RainbowHotFoil", "CardFreeForm2RainbowHotFoil"],
    ["None", null, null],
  ] as const)("finish=%s varnish=%s → %s", (finish, varnish, expected) => {
    expect(resolveMaterialName(finish, varnish)).toBe(expected);
  });
});
