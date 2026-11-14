/**
 * Pack d'effets Naruto Mythos TCG (CICABOOM) — catalogue only, pas de dump foil.
 *
 * Parallels Mythos / RA / S… reçoivent le flare maison sur une plaque
 * full-face (`foil/full_foil_mask.webp`), comme Carddass / DBS JCC.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";
import type { PlayroomArt } from "@/effects/pokemon/playroomArt";

export const NARUTO_MYTHOS_EFFECT_PACK_ID = "naruto-mythos";

const ASSET_BASE = "/assets/naruto/mythos";

/** Whole-face plate — foil under the art, not a shaped layer. */
export const NARUTO_MYTHOS_FULL_FOIL_MASK_URL = `${ASSET_BASE}/full_foil_mask.webp`;

/**
 * Finish → house shader. Mythos parallels are their own printKeys; one shiny
 * finish is enough — spectrum would invent detail we never captured.
 */
const FINISH_SHADER: Readonly<Record<string, string>> = {
  holo: "flare",
};

export const NARUTO_MYTHOS_FINISHES = Object.keys(FINISH_SHADER);

/** Demo face for the foils playroom (KS1 promo Mythos VV2 Naruto). */
const PLAYROOM_DEMO_ART = `${ASSET_BASE}/cards/en/ks1promo/0133-vv2/art.official.webp`;

function playroomArtForMaterial(name: string): PlayroomArt | null {
  const n = name.trim().toLowerCase();
  if (n === "holo") {
    return {
      imageUrl: PLAYROOM_DEMO_ART,
      maskUrl: NARUTO_MYTHOS_FULL_FOIL_MASK_URL,
      label: "Holofoil (générique)",
    };
  }
  return null;
}

export const narutoMythosEffectPack = defineCatalogueOnlyPack({
  id: NARUTO_MYTHOS_EFFECT_PACK_ID,
  label: "Naruto Mythos",
  blurb:
    "Catalogue local Mythos — dos attesté LorenZone / CICABOOM, foil flare maison",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/backs/en`,
  finishShader: FINISH_SHADER,
  listHouseFinishesAsMaterials: true,
  fallbackFoilMaskUrl: NARUTO_MYTHOS_FULL_FOIL_MASK_URL,
  playroomArtForMaterial,
});
