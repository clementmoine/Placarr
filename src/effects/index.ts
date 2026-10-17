import "@/effects/lorcana";
import "@/effects/pokemon";
import "@/effects/narutocarddass";
import "@/effects/narutoshippuden";
import "@/effects/narutoranks";
import "@/effects/narutoultra";
import "@/effects/narutomythos";
import "@/effects/narutokayou";
import "@/effects/narutodatacarddass";
import "@/effects/dbscg";
import "@/effects/dbsfw";
import "@/effects/dbslamincards";
import "@/effects/dbsjcc";
import "@/effects/dbh";
import "@/effects/bleachscb";
import "@/effects/onepiece";
import "@/effects/yugioh";
import "@/effects/mtg";
import "@/effects/leclerc";

import { markEffectsRegistered } from "@/effects/ensureEffects";

markEffectsRegistered();

export { getEffectPack, listEffectPacks } from "@/core/render/foil/backend";
export { LORCANA_EFFECT_PACK_ID } from "@/effects/lorcana";
export { POKEMON_EFFECT_PACK_ID } from "@/effects/pokemon";
export {
  NARUTO_CARDDASS_EFFECT_PACK_ID,
  NARUTO_CCG_EFFECT_PACK_ID,
} from "@/effects/narutocarddass";
export { DBS_CG_EFFECT_PACK_ID } from "@/effects/dbscg";
export { DBS_FW_EFFECT_PACK_ID } from "@/effects/dbsfw";
export { DBS_LAMINCARDS_EFFECT_PACK_ID } from "@/effects/dbslamincards";
export { DBS_JCC_EFFECT_PACK_ID } from "@/effects/dbsjcc";
export { DBH_EFFECT_PACK_ID } from "@/effects/dbh";
export { BLEACH_SCB_EFFECT_PACK_ID } from "@/effects/bleachscb";
export { NARUTO_SHIPPUDEN_EFFECT_PACK_ID } from "@/effects/narutoshippuden";
export { NARUTO_RANKS_EFFECT_PACK_ID } from "@/effects/narutoranks";
export { NARUTO_ULTRA_EFFECT_PACK_ID } from "@/effects/narutoultra";
export { NARUTO_MYTHOS_EFFECT_PACK_ID } from "@/effects/narutomythos";
export { NARUTO_KAYOU_EFFECT_PACK_ID } from "@/effects/narutokayou";
export { NARUTO_DATA_CARDDASS_EFFECT_PACK_ID } from "@/effects/narutodatacarddass";
export { ONEPIECE_EFFECT_PACK_ID } from "@/effects/onepiece";
export { YUGIOH_EFFECT_PACK_ID } from "@/effects/yugioh";
export { MTG_EFFECT_PACK_ID } from "@/effects/mtg";
export {
  LECLERC_DISNEY_EFFECT_PACK_ID,
  LECLERC_EFFECT_PACK_ID,
  LECLERC_MARVEL_EFFECT_PACK_ID,
} from "@/effects/leclerc";
