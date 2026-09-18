/**
 * Factory for catalogue-only effect packs: no APK, no shader dump. What these
 * packs carry is the card back (flip target via the registry) and, for some, a
 * texture-free *house* CSS look keyed by finish.
 *
 * Foils admin tab is gated by `cataloguePacks.hasFoilEffects`, not by this
 * factory. Opt in with {@link CatalogueOnlyPackOptions.listHouseFinishesAsMaterials}
 * so the playroom has finish names to tile — without inventing Unity materials.
 *
 * Lives in `src/effects/`, not in core: a pack is plug-and-play data, and the
 * blindness guard (`blindnessGuard.test.ts`) keeps pack literals out of
 * `core/`.
 */
import { registerEffectPack } from "@/core/render/foil/registry";
import { applyHouseFoilFallback } from "@/core/render/foil/houseFoilFallback";
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
  /**
   * Expose `finishShader` keys as playroom material names (CSS-only tiles).
   * Default off: most catalogue-only packs keep `hasFoilEffects === false`.
   */
  listHouseFinishesAsMaterials?: boolean;
  /** Whole-face mask when catalogue prints carry none of their own. */
  fallbackFoilMaskUrl?: string;
  /** Set- or family-scoped back; return null to fall through to cardBackUrl. */
  resolveCardBack?: EffectPackModule["resolveCardBack"];
  playroomArtForMaterial?: EffectPackModule["playroomArtForMaterial"];
  /** Override default finishShader → resolveCss mapping. */
  resolveCss?: EffectPackModule["resolveCss"];
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
    listHouseFinishesAsMaterials,
    fallbackFoilMaskUrl,
    resolveCardBack,
    playroomArtForMaterial,
    resolveCss: resolveCssOverride,
  } = options;

  const houseFinishes = finishShader ? Object.keys(finishShader) : [];
  const finishSet = new Set(houseFinishes.map((name) => name.toLowerCase()));

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
      resolveCss:
      resolveCssOverride ??
      (finishShader
        ? (finish) => {
            const key = (finish ?? "").toLowerCase();
            const mapped = finishShader[key] ?? null;
            return {
              finishShaderId: applyHouseFoilFallback(mapped, finish),
              varnishShaderId: null,
            };
          }
        : () => ({ finishShaderId: null, varnishShaderId: null })),
    listMaterials: () =>
      listHouseFinishesAsMaterials ? [...houseFinishes] : [],
    material: () => null,
    ...(listHouseFinishesAsMaterials
      ? {
          parseMaterialName: (name: string) => {
            const finish = name.trim().toLowerCase();
            return {
              finish: finishSet.has(finish) ? finish : null,
              varnish: null,
            };
          },
        }
      : {}),
    ...(playroomArtForMaterial ? { playroomArtForMaterial } : {}),
  };

  registerEffectPack(pack);
  return pack;
}
