/**
 * Factory for catalogue-only effect packs: no APK, no shader dump, so every
 * material hook stays empty (`hasFoilEffects === false`). What these packs do
 * carry is the card back (the flip target resolves through the registry) and,
 * for some, a texture-free *house* CSS look keyed by finish.
 *
 * Lives in `src/effects/`, not in core: a pack is plug-and-play data, and the
 * blindness guard (`blindnessGuard.test.ts`) keeps pack literals out of
 * `core/`.
 */
import { registerEffectPack } from "@/core/render/foil/registry";
import type { EffectPackModule } from "@/core/render/foil/types";

export type CatalogueOnlyPackOptions = {
  id: string;
  label: string;
  blurb: string;
  assetBase: string;
  cardBackUrl: string;
  /**
   * Finish (stored lower-cased) → house `HoloShader` id. Texture-free looks,
   * so a pack with no dump can still catch the light. Omit when the pack
   * renders nothing shiny — `resolveCss` then answers null for everything.
   */
  finishShader?: Record<string, string>;
  /** Whole-face mask when catalogue prints carry none of their own. */
  fallbackFoilMaskUrl?: string;
  /** Set- or family-scoped back; return null to fall through to cardBackUrl. */
  resolveCardBack?: EffectPackModule["resolveCardBack"];
};

export function defineCatalogueOnlyPack(
  options: CatalogueOnlyPackOptions,
): EffectPackModule {
  const {
    id,
    label,
    blurb,
    assetBase,
    cardBackUrl,
    finishShader,
    fallbackFoilMaskUrl,
    resolveCardBack,
  } = options;

  const pack: EffectPackModule = {
    id,
    label,
    blurb,
    assetBase,
    cardBackUrl,
    ...(resolveCardBack ? { resolveCardBack } : {}),
    resolveMaterial: () => null,
    resolveMaterialForPrint: () => null,
    ...(fallbackFoilMaskUrl ? { fallbackFoilMaskUrl } : {}),
    resolveCss: finishShader
      ? (finish) => ({
          finishShaderId: finishShader[(finish ?? "").toLowerCase()] ?? null,
          varnishShaderId: null,
        })
      : () => ({ finishShaderId: null, varnishShaderId: null }),
    listMaterials: () => [],
    material: () => null,
  };

  registerEffectPack(pack);
  return pack;
}
