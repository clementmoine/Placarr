/**
 * Dump-accurate Frost material recipes (packdata_assets_card_materials).
 * Playroom leaf ids map onto these Unity templates; floats/keywords stay
 * faithful so WebGL does not invent EFFECTS_LAYER_COUNT or FoilType.
 */

export type DbsFwMaterialProfile =
  | "base"
  | "holo"
  | "tabac"
  | "energy"
  | "superpara"
  | "pakipaki"
  | "championship"
  | "effects"
  | "ui";

export type DbsFwMaterialRecipe = {
  /** Unity material name when this leaf mirrors a shared template. */
  unityMaterial?: string;
  profile: DbsFwMaterialProfile;
  keywords: readonly string[];
  /** Discriminating floats merged over {@link DBS_FW_CARD_FLOATS}. */
  floats: Readonly<Record<string, number>>;
  /**
   * When true, bind shared HoloMap + Rainbow and coverage masks.
   * `map` plates only steer `_HoloMap` (no FoilMask/HoloMask).
   */
  holo: false | "covers" | "map";
  /** Prefer `_FoilPakipaki` plate in Middle/HoloMap when set. */
  pakipakiPlate?: boolean;
  /** Prefer CardHologram raster as map + championship gate. */
  championshipPlate?: boolean;
};

/**
 * Playroom leaf id → recipe. Plate-only inventory rows are omitted
 * (`clientMaterial` returns null without a shader).
 */
export const DBS_FW_MATERIAL_RECIPES: Readonly<
  Record<string, DbsFwMaterialRecipe>
> = {
  card: {
    unityMaterial: "Card",
    profile: "base",
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ZERO"],
    holo: false,
    floats: {
      _HoloFoilEnabled: 0,
      _FoilType: 0,
      _FoilShadow: 0,
      _ShowMiddleTex: 0,
      _UseFrame: 1,
      _UseFront: 1,
      _RainbowScale: 4,
      _RainbowColorMultiplier: 1,
      _EffectsLayer1MotionSpeed: 0,
      EFFECTS_LAYER_COUNT: 0,
    },
  },
  "foil-holo": {
    unityMaterial: "Card Foil_holo",
    profile: "holo",
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ZERO"],
    holo: "covers",
    floats: {
      _HoloFoilEnabled: 1,
      _FoilType: 2,
      _FoilShadow: 1,
      _ShowMiddleTex: 1,
      _UseFrame: 1,
      _UseFront: 1,
      _RainbowScale: 2,
      _RainbowColorMultiplier: 2,
      _EffectsLayer1MotionSpeed: 0,
      EFFECTS_LAYER_COUNT: 0,
    },
  },
  "tabac-holo": {
    unityMaterial: "Card Tabac_holo",
    profile: "tabac",
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ONE"],
    holo: "covers",
    floats: {
      _HoloFoilEnabled: 1,
      _FoilType: 0,
      _FoilShadow: 0,
      _ShowMiddleTex: 0,
      _UseFrame: 1,
      _UseFront: 1,
      _RainbowScale: 2,
      _RainbowColorMultiplier: 2,
      _EffectsLayer1MotionSpeed: 3,
      EFFECTS_LAYER_COUNT: 1,
    },
  },
  "energy-holo": {
    unityMaterial: "Card Variant Energy_holo",
    profile: "energy",
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ZERO"],
    holo: "map",
    floats: {
      _HoloFoilEnabled: 1,
      _FoilType: 0,
      _FoilShadow: 0,
      _ShowMiddleTex: 1,
      _UseFrame: 1,
      _UseFront: 1,
      _RainbowScale: 4,
      _RainbowColorMultiplier: 2,
      _EffectsLayer1MotionSpeed: 0,
      EFFECTS_LAYER_COUNT: 0,
    },
  },
  // E-111 / E-106 Unity dumps: materials Card + CardFIeld, plates Front+Holo.
  // Not Card Foil_holo — FoilType 2 would stamp the orange gold wash with no
  // mask-foil channel pack. Rainbow rides HoloMask; FoilType stays 0.
  para: {
    profile: "holo",
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ZERO"],
    holo: "covers",
    floats: {
      _HoloFoilEnabled: 1,
      _FoilType: 0,
      _FoilShadow: 0,
      _ShowMiddleTex: 0,
      _UseFrame: 1,
      _UseFront: 1,
      _RainbowScale: 2,
      _RainbowColorMultiplier: 2,
      EFFECTS_LAYER_COUNT: 0,
    },
  },
  // Same Unity dump shape as para (E-111): Front+Holo, Card/CardFIeld — FoilType 0.
  "e106-para": {
    profile: "holo",
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ZERO"],
    holo: "covers",
    floats: {
      _HoloFoilEnabled: 1,
      _FoilType: 0,
      _FoilShadow: 0,
      _ShowMiddleTex: 0,
      _UseFrame: 1,
      _UseFront: 1,
      _RainbowScale: 2,
      _RainbowColorMultiplier: 2,
      EFFECTS_LAYER_COUNT: 0,
    },
  },
  superpara: {
    profile: "superpara",
    // Two packed premiumtex layers — keyword must match COUNT float.
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_TWO"],
    holo: "covers",
    floats: {
      _HoloFoilEnabled: 1,
      _FoilType: 2,
      _FoilShadow: 1,
      _ShowMiddleTex: 1,
      _UseFrame: 1,
      _UseFront: 1,
      _RainbowScale: 2,
      _RainbowColorMultiplier: 2,
      _EffectsLayer1MotionSpeed: 3,
      _EffectsLayer2MotionSpeed: 3,
      EFFECTS_LAYER_COUNT: 2,
    },
  },
  // Premiumtex demos on catalogue faces — no holo/FoilType stamp.
  "effects-uv-shine": {
    profile: "effects",
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ONE"],
    holo: false,
    floats: {
      _HoloFoilEnabled: 0,
      _FoilType: 0,
      _FoilShadow: 0,
      _ShowMiddleTex: 0,
      _UseFrame: 1,
      _UseFront: 1,
      _EffectsLayer1MotionSpeed: 3,
      EFFECTS_LAYER_COUNT: 1,
    },
  },
  "effects-ef-flash": {
    profile: "effects",
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ONE"],
    holo: false,
    floats: {
      _HoloFoilEnabled: 0,
      _FoilType: 0,
      _FoilShadow: 0,
      _ShowMiddleTex: 0,
      _UseFrame: 1,
      _UseFront: 1,
      _EffectsLayer1MotionSpeed: 3,
      EFFECTS_LAYER_COUNT: 1,
    },
  },
  "effects-uv-rainbow": {
    profile: "effects",
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ONE"],
    holo: false,
    floats: {
      _HoloFoilEnabled: 0,
      _FoilType: 0,
      _FoilShadow: 0,
      _ShowMiddleTex: 0,
      _UseFrame: 1,
      _UseFront: 1,
      _EffectsLayer1MotionSpeed: 3,
      EFFECTS_LAYER_COUNT: 1,
    },
  },
  pakipaki: {
    profile: "pakipaki",
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ZERO"],
    holo: "covers",
    pakipakiPlate: true,
    floats: {
      _HoloFoilEnabled: 1,
      _FoilType: 2,
      _FoilShadow: 1,
      _FoilPakipaki: 1,
      _ShowMiddleTex: 1,
      _UseFrame: 1,
      _UseFront: 1,
      EFFECTS_LAYER_COUNT: 0,
    },
  },
  "card-hologram": {
    profile: "championship",
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ZERO"],
    holo: "map",
    championshipPlate: true,
    floats: {
      _HoloFoilEnabled: 1,
      _FoilType: 0,
      _ChampionshipHologram: 1,
      _ShowMiddleTex: 1,
      _UseFrame: 1,
      _UseFront: 1,
      EFFECTS_LAYER_COUNT: 0,
    },
  },
};

export function dbsFwMaterialRecipe(
  leafId: string,
): DbsFwMaterialRecipe | null {
  return DBS_FW_MATERIAL_RECIPES[leafId.trim().toLowerCase()] ?? null;
}
