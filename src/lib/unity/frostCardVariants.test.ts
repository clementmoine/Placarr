import { describe, expect, it } from "vitest";

import {
  frostCardFragmentForKeywords,
  frostEffectsLayerCountKeyword,
  frostEffectsLayerMax,
} from "./frostCardVariants";

describe("frostEffectsLayerMax / count keyword", () => {
  it("detects ZERO when no EffectsLayer samplers appear", () => {
    const src = "texture2d<float> _HoloMap; texture2d<float> _FrontTex;";
    expect(frostEffectsLayerMax(src)).toBe(0);
    expect(frostEffectsLayerCountKeyword(src)).toBe("EFFECTS_LAYER_COUNT_ZERO");
  });

  it("detects FIVE from the highest layer index", () => {
    const src = `
      texture2d<float> _EffectsLayer1Tex;
      texture2d<float> _EffectsLayer5Motion;
      texture2d<float> _EffectsLayer3Tex;
    `;
    expect(frostEffectsLayerMax(src)).toBe(5);
    expect(frostEffectsLayerCountKeyword(src)).toBe("EFFECTS_LAYER_COUNT_FIVE");
  });
});

describe("frostCardFragmentForKeywords", () => {
  it("maps effects leaves onto keyed FrostCard variants", () => {
    expect(
      frostCardFragmentForKeywords(["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ONE"]),
    ).toBe("FrostCard__ARTWORK_ON__EFFECTS_LAYER_COUNT_ONE.frag");
    expect(
      frostCardFragmentForKeywords(["ARTWORK_ON", "EFFECTS_LAYER_COUNT_FIVE"]),
    ).toBe("FrostCard__ARTWORK_ON__EFFECTS_LAYER_COUNT_FIVE.frag");
    expect(
      frostCardFragmentForKeywords(["ARTWORK_ON", "EFFECTS_LAYER_COUNT_TWO"]),
    ).toBe("FrostCard__ARTWORK_ON__EFFECTS_LAYER_COUNT_TWO.frag");
  });

  it("keeps legacy FrostCard.frag for ZERO / foil-holo", () => {
    expect(
      frostCardFragmentForKeywords(["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ZERO"]),
    ).toBe("FrostCard.frag");
    expect(frostCardFragmentForKeywords(["ARTWORK_ON"])).toBe("FrostCard.frag");
  });
});
