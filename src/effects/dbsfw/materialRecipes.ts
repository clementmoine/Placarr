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
   * Colour overrides merged over {@link DBS_FW_CARD_COLORS}.
   * Card Foil_holo dumps `_EffectsLayer1Color` as zero — COUNT>0 leaves
   * must override or the layer multiplies to black.
   */
  colors?: Readonly<Record<string, readonly number[]>>;
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

/** Card Tabac_holo dump — Layer1 tint (Foil_holo leaves this at 0). */
export const DBS_FW_TABAC_EFFECTS_LAYER1_COLOR = [
  0.6132075786590576,
  0.6132075786590576,
  0.6132075786590576,
  0.5098039507865906,
] as const;

/** Solo premiumtex demos — full white so the plate's own chroma shows. */
export const DBS_FW_EFFECTS_DEMO_LAYER1_COLOR = [1, 1, 1, 1] as const;

/**
 * FB02-036_front Card dump — EffectsLayer colours (HoloFoilEnabled=0,
 * FoilType=0). L1 is `uv_line_rainbow`; stack is COUNT_FIVE.
 */
export const DBS_FW_FB02_036_LAYER_COLORS = {
  _EffectsLayer1Color: [
    3.0898327827453613, 1.6037734746932983, 4, 0.501960813999176,
  ],
  _EffectsLayer2Color: [
    0.8990983963012695, 0.5323260426521301, 1.2134743928909302, 1,
  ],
  _EffectsLayer3Color: [
    1.389282464981079, 1.03651762008667, 2.469008445739746, 1,
  ],
  _EffectsLayer4Color: [0.7688679099082947, 1, 0.8239918351173401, 1],
  _EffectsLayer5Color: [0.9285712242126465, 0, 1, 1],
  _EffectsLayer5Scale: [5, 5, 0, 0],
} as const;

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
    colors: {
      _EffectsLayer1Color: DBS_FW_TABAC_EFFECTS_LAYER1_COLOR,
    },
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
    colors: {
      _EffectsLayer1Color: DBS_FW_EFFECTS_DEMO_LAYER1_COLOR,
    },
    floats: {
      _HoloFoilEnabled: 0,
      _FoilType: 0,
      _FoilShadow: 0,
      _ShowMiddleTex: 0,
      _UseFrame: 1,
      _UseFront: 1,
      // Speed 0 → card UVs (Pivot/Scale); plate α gates via reused motion.
      _EffectsLayer1MotionSpeed: 0,
      _EffectsLayer1ColorMultiplier: 2,
      EFFECTS_LAYER_COUNT: 1,
    },
  },
  "effects-ef-flash": {
    profile: "effects",
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_ONE"],
    holo: false,
    colors: {
      _EffectsLayer1Color: DBS_FW_EFFECTS_DEMO_LAYER1_COLOR,
    },
    floats: {
      _HoloFoilEnabled: 0,
      _FoilType: 0,
      _FoilShadow: 0,
      _ShowMiddleTex: 0,
      _UseFrame: 1,
      _UseFront: 1,
      _EffectsLayer1MotionSpeed: 0,
      _EffectsLayer1ColorMultiplier: 2,
      EFFECTS_LAYER_COUNT: 1,
    },
  },
  // FB02-036_front Card — full COUNT_FIVE stack (m_ValidKeywords).
  // HoloFoilEnabled=0 / FoilType=0: EffectsLayers scroll via `_Time`+motion
  // (Frost has no `_Tilt`). Idle = wall clock; tilt = lean→time phase on top
  // (`foilEffectsClockSeconds`). L1=uv_line_rainbow.
  "effects-uv-rainbow": {
    profile: "effects",
    keywords: ["ARTWORK_ON", "EFFECTS_LAYER_COUNT_FIVE"],
    holo: false,
    colors: { ...DBS_FW_FB02_036_LAYER_COLORS },
    floats: {
      _HoloFoilEnabled: 0,
      _FoilType: 0,
      _FoilShadow: 0,
      _ShowMiddleTex: 0,
      _UseFrame: 1,
      _UseFront: 1,
      _EffectsLayer1MotionSpeed: 6,
      _EffectsLayer1ColorMultiplier: 2,
      _EffectsLayer1Rotation: 0,
      _EffectsLayer2MotionSpeed: 12,
      _EffectsLayer2ColorMultiplier: 1,
      _EffectsLayer2Rotation: 0,
      _EffectsLayer3MotionSpeed: 2,
      _EffectsLayer3ColorMultiplier: 2,
      _EffectsLayer3Rotation: 0,
      _EffectsLayer4MotionSpeed: 0,
      _EffectsLayer4ColorMultiplier: 2,
      _EffectsLayer4Rotation: 8,
      _EffectsLayer5MotionSpeed: 4,
      _EffectsLayer5ColorMultiplier: 2,
      _EffectsLayer5Rotation: 50,
      EFFECTS_LAYER_COUNT: 5,
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
