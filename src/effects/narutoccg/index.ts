/**
 * Naruto CCG effect pack — card back only.
 *
 * The pack is catalogue-only: no APK, no shader dump, no foil masks (see
 * `cataloguePacks.hasFoilEffects === false`). It is registered all the same
 * because the card back resolves through the effect pack registry
 * (`resolveCardBackCandidates`), and without one a Naruto card had nothing to
 * flip to — the verso stayed blank while Lorcana and Pokémon flipped fine.
 *
 * Every material hook returns empty on purpose rather than inventing a look:
 * these cards are plain cardboard scans, and a fake foil layer would be worse
 * than none.
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

export const narutoCcgEffectPack: EffectPackModule = {
  id: NARUTO_CCG_EFFECT_PACK_ID,
  label: "Naruto CCG",
  blurb: "Catalogue local — dos de pack, sans effet foil",
  assetBase: ASSET_BASE,
  /** Recreated in Figma; provenance in `data/naruto/ccg/cards/BACK.md`. */
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
  resolveMaterial: () => null,
  resolveMaterialForPrint: () => null,
  /** No shader either side: a plain scan gets no foil and no varnish. */
  resolveCss: () => ({ finishShaderId: null, varnishShaderId: null }),
  listMaterials: () => [],
  material: () => null,
};

registerEffectPack(narutoCcgEffectPack);
