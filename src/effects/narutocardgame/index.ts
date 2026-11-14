import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";
import { assetsPackTierBackRoleUrl } from "@/lib/packAssetUrls";
import { narutoCardgameBackTierFromPrintKey } from "@/providers/naruto/narutocardgame/cardBack";
import { NARUTO_CARDGAME_PACK_ID } from "@/providers/naruto/narutocardgame/pack";

export const NARUTO_CARDGAME_EFFECT_PACK_ID = "naruto-cardgame";

const ASSET_BASE = "/assets/naruto/cardgame";

export const narutoCardgameEffectPack = defineCatalogueOnlyPack({
  id: NARUTO_CARDGAME_EFFECT_PACK_ID,
  label: "Naruto Card Game",
  blurb:
    "Catalogue local Naruto Card Game (Bandai Card Games, lancement 2027) — fr/en/ja",
  assetBase: ASSET_BASE,
  /** Character / EX — dos blanc pack. Leader / Chakra / Summon via resolveCardBack. */
  cardBackUrl: `${ASSET_BASE}/backs/en`,
  resolveCardBack: ({ printKey }) => {
    const tier = narutoCardgameBackTierFromPrintKey(printKey);
    if (!tier) return null;
    return assetsPackTierBackRoleUrl(NARUTO_CARDGAME_PACK_ID, tier);
  },
});
