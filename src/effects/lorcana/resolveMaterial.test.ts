import { describe, expect, it } from "vitest";

import { resolveMaterialName } from "./resolveMaterial";

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
  ] as const)(
    "finish=%s varnish=%s → %s",
    (finish, varnish, expected) => {
      expect(resolveMaterialName(finish, varnish)).toBe(expected);
    },
  );
});
