/**
 * Pack d'effets Dragon Ball JCC (Bandai France) — catalogue + look foil maison.
 *
 * Pas de dump Unity : les Holos / Prism reçoivent le même flare texture-free
 * que Naruto Carddass, sur une plaque full-face (`full_foil_mask.webp`).
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const DBS_JCC_EFFECT_PACK_ID = "dbs-jcc";

const ASSET_BASE = "/assets/dragonball/jcc";

/** Whole-face plate — foil under the art, not a shaped layer. */
export const DBS_JCC_FULL_FOIL_MASK_URL = `${ASSET_BASE}/full_foil_mask.webp`;

/**
 * Finish → house shader. Rarity *is* the finish on this line (Holo / Prism
 * prints are distinct catalogue rows, not a picker axis).
 */
const FINISH_SHADER: Readonly<Record<string, string>> = {
  holo: "flare",
  prism: "flare",
};

export const DBS_JCC_FINISHES = Object.keys(FINISH_SHADER);

export const dbsJccEffectPack = defineCatalogueOnlyPack({
  id: DBS_JCC_EFFECT_PACK_ID,
  label: "Dragon Ball JCC",
  blurb:
    "Catalogue local Dragon Ball Carddass / JCC — holo/prism en look flare maison",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
  finishShader: FINISH_SHADER,
  fallbackFoilMaskUrl: DBS_JCC_FULL_FOIL_MASK_URL,
});
