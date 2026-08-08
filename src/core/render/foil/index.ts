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
  clearFoilPool,
  resetFoilPoolForTests,
  setFoilPoolMax,
  subscribeFoilPool,
} from "./pool";

export { hotFoilStampUniforms } from "./hotFoilStamp";

export { getEffectPack, listEffectPacks, registerEffectPack } from "./registry";

export { selectFoilBackend } from "./selectBackend";

export {
  pickDefaultCardBack,
  rankCardBacks,
  resolveCardBackCandidates,
  resolveCardBackUrl,
  resolveDefaultCardBack,
  sharedCardBackSkeletonUrl,
  type CardBackCandidate,
  type CardBackScope,
} from "./resolveBack";
export { foilRenderScale, FOIL_SHARP_WIDTH_PX } from "./capabilities";
export { subscribeFoilFrame, foilClockSeconds } from "./clock";
export {
  IDLE_LEAN_FACTOR,
  IDLE_RELEASE_MS,
  blendGlare,
  blendLean,
  easeOutCubic,
  idleLeanFromSeconds,
  idlePointerFromSeconds,
} from "./idleLean";

export {
  BACKGROUND_X_RANGE,
  BACKGROUND_Y_RANGE,
  adjust,
  applyFoilPointerCss,
  compressBackgroundX,
  compressBackgroundY,
  foilPointerVars,
  type FoilPointerCssVars,
} from "./pointerCss";

export {
  POINTER_SPRING_OMEGA,
  springLean,
  springSettled,
  springStep,
} from "./pointerSpring";
