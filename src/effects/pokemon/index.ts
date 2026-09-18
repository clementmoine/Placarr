/**
 * Pokémon TCG **paper** foil pack — same `EffectPackModule` shape as Lorcana.
 *
 * Sources (fidélité) : WebGL = TCG Live HoloFoil ; CSS = Live plates + intention
 * frag (`holoShadersPokemon`) ; Simey = analyse / catalogue non-Live only.
 * Backend auto = WebGL2 si matériau, sinon CSS. Voir `docs/foil_effects.md`.
 * Pack id `pokemon` (not a provider id). Catalogue art prefers Live dump front
 * when joined; TCGdex = attachment / fallback.
 * Pack back: `/assets/pokemon/cards/back.webp`.
 */

import type { EffectPackModule } from "@/core/render/foil/types";
import { registerEffectPack } from "@/core/render/foil/registry";

import { resolveCssRecipe } from "./cssRecipes";
import { liveFoilMaskForBundle, isLiveFoilMaskOverride } from "./liveFoilMasks";
import { lookupByBundle } from "./liveCardsLookups";
import {
  paperMaterial,
  parsePaperMaterialName,
  listPokemonMaterialNames,
} from "./materials";
import {
  playroomArtForMaterial,
  listPlayroomArtsForMaterial,
} from "./playroomArt";
import {
  resolveEffectForPaperCard,
  resolveEffectForPrintKey,
} from "./resolveEffect";

export const POKEMON_EFFECT_PACK_ID = "pokemon";
export const POKEMON_ASSET_BASE = "/assets/pokemon";
/** Pack default back — dump must extract `cards/back.webp` (APK / CDN / bundles). */
export const POKEMON_CARD_BACK_URL = `${POKEMON_ASSET_BASE}/cards/back.webp`;
/** Opaque white when a HoloFoil material needs a mask and none is dumped yet. */
export const POKEMON_FULL_FOIL_MASK_URL = `${POKEMON_ASSET_BASE}/full_foil_mask.webp`;

export { foilManifestToShader, POKEMON_FOIL_NAMES } from "./foilNames";
export {
  applyLiveFoilMask,
  listPokemonMaterialNames,
  paperMaterial,
  parsePaperMaterialName,
  POKEMON_MATERIAL_NAMES,
  POKEMON_MAT_ALIASES,
} from "./materials";
export {
  listLiveSetIds,
  listPaperBundleIds,
  liveSetIdFromTcgdexSet,
  paperArtUrl,
  paperBundleId,
  paperCard,
  paperMaskUrl,
  pickPaperVariant,
  isPaperFoilVariant,
  resolveEffectForPaperCard,
  resolveEffectForPrintKey,
  resolveLiveBundleForPrintKey,
} from "./resolveEffect";
export {
  LIVE_PH_FINISH,
  LIVE_STD_FINISH,
  appendUnreachableLiveFinishes,
  coveredLiveKeys,
  isLiveSyntheticFinish,
  unreachableLiveKeys,
} from "./liveFinishVariants";
export { joinLiveForPrint, type LiveJoinResult } from "./liveJoin";
export {
  lookupByBundle,
  lookupByName,
  lookupBySetNum,
  liveCardsIndexAvailable,
  type LiveCardRow,
} from "./liveCardsLookups";
export {
  LIVE_SET_NON_CATALOGUE,
  isLiveNonCatalogueSet,
  liveSetToTcgdexSets,
  TCGDEX_TO_LIVE_SET,
  TCGDEX_TO_LIVE_SETS,
} from "./setAliases";
export {
  remapCollectorNumberForLive,
  SM115_SHINY_VAULT_LIVE_OFFSET,
} from "./collectorRemap";
export {
  liveSetCandidatesForResolve,
  liveSetCandidatesFromTcgdexSet,
  mechanicalReprintFallbackStems,
} from "./liveSetId";
export { listReprintMetaSets, reprintMetaForTcgdexSet } from "./reprintMeta";
export {
  playroomArtForMaterial,
  listPlayroomArtsForMaterial,
  PLAYROOM_FACES_PER_MATERIAL,
} from "./playroomArt";
export type { PlayroomArt } from "./playroomArt";
export {
  ownedBundlesForShader,
  isOwnedPlayroomBundle,
} from "./liveOwnedBundles";

function foilMaskForBundle(
  bundleId: string | null | undefined,
  opts?: { variant?: string | null },
): string | null {
  if (!bundleId) return null;
  // Prefer the client-safe JSON slice; fall back to sqlite when installed.
  const fromJson = liveFoilMaskForBundle(bundleId, { variant: opts?.variant });
  if (fromJson) return fromJson;
  const row = lookupByBundle(bundleId, {
    variant: opts?.variant ?? undefined,
  });
  const mask = row?.foilMask ?? null;
  return isLiveFoilMaskOverride(mask) ? mask : null;
}

function materialFromName(name: string, opts?: { foilMask?: string | null }) {
  const direct = paperMaterial(name, opts);
  if (direct) return direct;
  const resolved = resolveEffectForPaperCard({ bundleId: name });
  if (!resolved) return null;
  const foilMask =
    opts?.foilMask ??
    foilMaskForBundle(resolved.bundle, { variant: resolved.variant });
  return paperMaterial(resolved.shader, { foilMask });
}

export const pokemonPaperEffectPack: EffectPackModule = {
  id: POKEMON_EFFECT_PACK_ID,
  label: "Pokémon",
  blurb: "CSS Live + WebGL Live",
  assetBase: POKEMON_ASSET_BASE,
  cardBackUrl: POKEMON_CARD_BACK_URL,
  fallbackFoilMaskUrl: POKEMON_FULL_FOIL_MASK_URL,
  // Catalogue finishes ("holo") need printKey → Live bundle. Without it, only
  // exact dumped stems / MaterialManifest strings / bundle ids resolve.
  resolveMaterial: (finish) => materialFromName(finish),
  resolveMaterialForPrint: (finish, _varnish, opts) => {
    if (opts?.printKey) {
      const resolved = resolveEffectForPrintKey(
        opts.printKey,
        finish,
        "fr",
        opts.title,
      );
      if (resolved) {
        const foilMask =
          opts.foilMask ??
          foilMaskForBundle(resolved.bundle, { variant: resolved.variant });
        return paperMaterial(resolved.shader, { foilMask });
      }
    }
    return materialFromName(finish, { foilMask: opts?.foilMask });
  },
  // CSS = Live plates (fallback when WebGL unavailable) — `docs/foil_effects.md`.
  resolveCss: (finish, varnish, opts) => {
    let foilMask = opts?.foilMask ?? null;
    if (!foilMask && opts?.printKey) {
      const resolved = resolveEffectForPrintKey(
        opts.printKey,
        finish,
        "fr",
        opts.title,
      );
      if (resolved) {
        foilMask = foilMaskForBundle(resolved.bundle, {
          variant: resolved.variant,
        });
      }
    }
    return resolveCssRecipe(finish, varnish, { foilMask });
  },
  listMaterials: () => listPokemonMaterialNames(),
  material: (name) => paperMaterial(name),
  materialForPrint: (name, opts) =>
    paperMaterial(name, { foilMask: opts?.foilMask }),
  parseMaterialName: parsePaperMaterialName,
  playroomArtForMaterial,
  playroomArtsForMaterial: listPlayroomArtsForMaterial,
};

registerEffectPack(pokemonPaperEffectPack);
