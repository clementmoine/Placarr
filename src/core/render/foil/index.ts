export type {
  EffectPackModule,
  FoilAstcBinding,
  FoilBackend,
  FoilBackendPreference,
  FoilCssRecipe,
  FoilFilter,
  FoilMaterial,
  FoilTextureBinding,
  FoilTextureRole,
  FoilWrap,
} from "./types";

export {
  astcFormatConstant,
  getFoilCapabilities,
  probeFoilCapabilities,
  resetFoilCapabilitiesForTests,
  type FoilCapabilities,
} from "./capabilities";

export {
  fetchArrayBuffer,
  fetchFragmentSource,
  fetchImageBitmap,
  __foilCacheStats,
  __resetFoilCachesForTests,
} from "./cache";

export {
  acquireFoilSlot,
  foilPoolSize,
  foilPoolWaiting,
  hasFoilSlot,
  releaseFoilSlot,
  resetFoilPoolForTests,
  setFoilPoolMax,
  subscribeFoilPool,
} from "./pool";

export { getEffectPack, listEffectPacks, registerEffectPack } from "./registry";

export { selectFoilBackend } from "./selectBackend";

export { resolveCardBackUrl } from "./resolveBack";
export { foilRenderScale, FOIL_SHARP_WIDTH_PX } from "./capabilities";
export { subscribeFoilFrame, foilClockSeconds } from "./clock";
