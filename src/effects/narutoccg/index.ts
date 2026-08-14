/**
 * Naruto CCG effect pack — card back, and a house look per finish.
 *
 * The pack is catalogue-only: no APK and no shader dump, so there is no
 * extracted material library to browse — that is what
 * `cataloguePacks.hasFoilEffects === false` still means, and why every
 * material hook returns empty. It is registered because the card back resolves
 * through the effect pack registry (`resolveCardBackCandidates`), and without
 * one a Naruto card had nothing to flip to.
 *
 * What it does render is a *house* CSS look. Those are texture-free, so they
 * need no dump: an approximation is honest here because we know from the
 * catalogue which prints are foil (the rarity is the finish on this game), we
 * just do not have the captured layer. The alternative was showing a holo and
 * a common as the same flat scan.
 */
import { registerEffectPack } from "@/core/render/foil/registry";
import type { EffectPackModule } from "@/core/render/foil/types";

/**
 * Id chosen to collide with nothing else quoted in the tree: the data-pack
 * path and the provider id are both mentioned legitimately elsewhere, and the
 * bare franchise word is a title-enrichment keyword. The blindness guards match
 * an id wrapped in quotes or backticks, so any of those three would flag a
 * innocent mention as a leak into core.
 */
export const NARUTO_CCG_EFFECT_PACK_ID = "naruto-ccg";

const ASSET_BASE = "/assets/naruto/ccg";

/**
 * Whole face shines: these cards have foil under the art, not a shaped layer.
 *
 * Providers stamp this on the candidate (as TCGdex does with the Pokémon one)
 * rather than leaning on `fallbackFoilMaskUrl`: the picker, the card tile and
 * the detail page all gate the foil layer on the *candidate* having a mask, so
 * a print without one renders flat before the pack fallback is ever consulted.
 */
export const NARUTO_CCG_FULL_FOIL_MASK_URL = `${ASSET_BASE}/full_foil_mask.webp`;

/**
 * Finish → house shader. The house set is texture-free, so a pack with no
 * Unity dump can still catch the light; the Lorcana looks are unusable here
 * because they sample `/assets/lorcana/web/*.jpg`.
 *
 * One shiny finish, deliberately. The line has no reverse and no etch, and a
 * promo is a way a card was handed out, not a way it was printed — that stays
 * a fact on the card, not a finish. `etch` is left out too: it needs a
 * per-print mask we do not have.
 */
const FINISH_SHADER: Record<string, string> = {
  // "Tight repeating spectrum: what every foil used to look like" — a 2006
  // Carddass holo, exactly.
  holo: "rainbowBands",
};

/** Finish names this pack renders, lower-cased as they are stored. */
export const NARUTO_CCG_FINISHES = Object.keys(FINISH_SHADER);

export const narutoCcgEffectPack: EffectPackModule = {
  id: NARUTO_CCG_EFFECT_PACK_ID,
  label: "Naruto CCG",
  blurb: "Catalogue local — dos de pack, sans effet foil",
  assetBase: ASSET_BASE,
  /** Recreated in Figma; provenance in `data/naruto/ccg/cards/BACK.md`. */
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
  resolveMaterial: () => null,
  resolveMaterialForPrint: () => null,
  fallbackFoilMaskUrl: NARUTO_CCG_FULL_FOIL_MASK_URL,
  resolveCss: (finish) => ({
    finishShaderId: FINISH_SHADER[(finish ?? "").toLowerCase()] ?? null,
    // No varnish on this line — the cards are matte outside the foil.
    varnishShaderId: null,
  }),
  listMaterials: () => [],
  material: () => null,
};

registerEffectPack(narutoCcgEffectPack);
