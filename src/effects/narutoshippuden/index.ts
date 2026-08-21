/**
 * Pack d'effets du 「NARUTO-ナルト- 疾風伝 カードゲーム」 (2007-2009).
 *
 * Il existe pour une raison précise : **le dos**. Les dos sont servis par
 * langue, et ce jeu est japonais seul — tant qu'il vivait dans le pack
 * Carddass, ses 313 cartes recevaient `back.ja.webp`, c'est-à-dire le triskèle
 * 忍/術/幻 du Carddass. Le sien dit « NARUTO 疾風伝 CARD GAME » dans un losange :
 * deux jeux différents, deux dos.
 *
 * Aucun foil capté : comme le Carddass, ce pack est catalogue seul, sans APK ni
 * dump de shaders. Les crochets de matériau rendent donc vide, et c'est ce que
 * `hasFoilEffects === false` veut dire.
 */
import { registerEffectPack } from "@/core/render/foil/registry";
import type { EffectPackModule } from "@/core/render/foil/types";

export const NARUTO_SHIPPUDEN_EFFECT_PACK_ID = "naruto-shippuden";

const ASSET_BASE = "/assets/naruto/shippuden";

export const narutoShippudenEffectPack: EffectPackModule = {
  id: NARUTO_SHIPPUDEN_EFFECT_PACK_ID,
  label: "Naruto 疾風伝",
  blurb: "Catalogue local — dos du jeu, sans effet foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.ja.webp`,
  resolveMaterial: () => null,
  resolveMaterialForPrint: () => null,
  resolveCss: () => ({ finishShaderId: null, varnishShaderId: null }),
  listMaterials: () => [],
  material: () => null,
};

registerEffectPack(narutoShippudenEffectPack);
