/**
 * Pokémon CSS foil — branch **every** Simey rarity recipe we have onto a Live
 * leaf (and catalogue bucket). Prefer staging Simey look ids (`exFullArt`,
 * `illustrationRare`, …) tels quels; keep Live-tuned ports only where foil_mask
 * routing needs them (`sunPillar`+Cc, `flatSilver`+pokéball, `radiantHolo` etch).
 * WebGL stays Live Unity. Unknown future leaf → {@link DEFAULT_FINISH_CSS_ID}.
 */

/**
 * Whether the CSS fallback is live in product UI.
 *
 * Kept as a flag rather than deleted: it is the one switch that returns every
 * Pokémon surface to plain if the masked looks turn out wrong somewhere, and
 * the guard test pins what it must never do in either position.
 */
export const POKEMON_CSS_FOIL_SHIPPED = true;

import type { HouseHoloShaderId } from "@/core/render/holoShadersHouse";
import type { PokemonHoloShaderId } from "@/core/render/holoShadersPokemon";
import {
  type SimeyHoloShaderId,
} from "@/core/render/holoShadersSimey";

import { foilManifestToShader } from "./foilNames";
import { HOUSE_FOIL_FALLBACK_CSS_ID } from "@/core/render/foil/houseFoilFallback";

/** Everyday reverse / parallel sheen — simey `reverse-holo.css`. */
export const REVERSE_FINISH_CSS_ID: SimeyHoloShaderId = "reverseHolo";

/**
 * Pokémon pack default — shared house fallback (`flare`) when no Simey look.
 */
export const DEFAULT_FINISH_CSS_ID = HOUSE_FOIL_FALLBACK_CSS_ID;

type CssLookId = HouseHoloShaderId | PokemonHoloShaderId | SimeyHoloShaderId;

/**
 * Live leaf → best Simey (or Simey-backed) CSS look we already ship.
 * Goal: use the full poke-holo / poke-151 inventory, not leave Live on `flare`
 * when a rarity recipe exists.
 */
export const LIVE_FINISH_CSS: Readonly<Record<string, CssLookId>> = {
  // poke-holo
  RadiantHolo: "radiantHolo", // Live etch port of radiant-holo
  Rainbow: "rainbowHolo",
  Rainbow02: "rainbowAlt",
  SwSecret: "secretRare",
  SwSecreT02: "secretRare",
  Cosmos: "cosmosHolo",
  Galaxy: "amazingRare",
  FlatSilver: "flatSilver", // reverse-holo + Live mask routing
  FlatSilver_CC: "pokeBallHolo",
  SvUltra: "vFullArt",
  SvHolo: "vStar",
  SwHolo: "vRegular",
  AceFoil: "vMax",
  // poke-151
  AngledPillars: "exFullArt",
  SunPillar: "sunPillar", // ex-regular Live paint + CastAndCure
  CrackedIce: "illustrationRare",
  SvUltraScodix: "hyperRare",
  SvUltraGoldRainbow: "hyperRare",
  // Remaining Live leaves → closest Simey rarity we have
  SunBeam: "regularHolo",
  SunLava: "shinyV",
  Thatch: "trainerGalleryHolo",
  Tinsel: "shinyRare",
  Squares: "shinyV",
  Stamped: "shinyRare",
  "25thConfetti": "trainerGalleryHolo",
  SolidColor: "reverseHolo",
};

/** Resolve Live leaf → Simey-backed CSS id, or null (caller → flare). */
export function resolveLiveFinishCssId(leaf: string): CssLookId | null {
  const trimmed = leaf.trim();
  if (!trimmed) return null;
  return LIVE_FINISH_CSS[trimmed] ?? null;
}

/** True when a named Live leaf would only get the pack default CSS look. */
export function isCssFinishFallbackOnly(leaf: string): boolean {
  const trimmed = leaf.trim();
  if (!trimmed) return false;
  if (resolveLiveFinishCssId(trimmed)) return false;
  const live = foilManifestToShader(trimmed);
  if (!live || live === "NonFoil") return false;
  if (resolveLiveFinishCssId(live)) return false;
  if (CATALOGUE[trimmed.toLowerCase()]) return false;
  return true;
}

/** Finishes that paint Live etch inside the shine stack (no house varnish). */
const ETCH_PAINT_FINISH_IDS = new Set<string>([
  "radiantHolo",
  "swSecret",
  "secretRare",
  "amazingRare",
]);

const CATALOGUE: Readonly<Record<string, CssLookId>> = {
  holo: "regularHolo",
  reverse: REVERSE_FINISH_CSS_ID,
  firstedition: "regularHolo",
  wpromo: "regularHolo",
  "live-std": "regularHolo",
  "live-ph": REVERSE_FINISH_CSS_ID,
  cosmos: "cosmosHolo",
  rainbow: "rainbowHolo",
  amazing: "amazingRare",
  secret: "secretRare",
  shiny: "shinyRare",
  v: "vRegular",
  vmax: "vMax",
  vstar: "vStar",
  pokeball: "pokeBallHolo",
  masterball: "flatSilverCcMb",
  ex: "exFullArt",
};

/** Soft etch / cold-foil coat through the per-print etch mask. */
export const ETCH_VARNISH_CSS_ID: HouseHoloShaderId = "etch";

export type ResolveCssRecipeOpts = {
  /** Live `foil_mask` enum — CastAndCure / ReverseLaminate*. */
  foilMask?: string | null;
};

/**
 * Mirror WebGL `applyLiveFoilMask`: CastAndCure enables Northern Cross;
 * ReverseLaminate* swaps FlatSilver onto Poké / Master Ball carves.
 */
export function applyFoilMaskCss(
  finishShaderId: string,
  foilMask: string | null | undefined,
): string {
  const mask = (foilMask ?? "").trim();
  if (!mask || mask === "None") return finishShaderId;

  if (finishShaderId === "sunPillar" && mask === "CastAndCure") {
    return "sunPillarCc";
  }
  if (
    (finishShaderId === "flatSilver" ||
      finishShaderId === "flatSilverCc" ||
      finishShaderId === "pokeBallHolo") &&
    mask === "ReverseLaminatePokeBall"
  ) {
    return "flatSilverCc";
  }
  if (
    (finishShaderId === "flatSilver" ||
      finishShaderId === "flatSilverCc" ||
      finishShaderId === "flatSilverCcMb" ||
      finishShaderId === "pokeBallHolo") &&
    mask === "ReverseLaminateMasterBall"
  ) {
    return "flatSilverCcMb";
  }
  return finishShaderId;
}

/**
 * Resolve a Pokémon finish string to CSS look ids.
 * Unknown / NonFoil / no Simey analogue → finish null or pack default flare.
 */
export function resolveCssRecipe(
  finish: string | null | undefined,
  varnish: string | null | undefined,
  opts?: ResolveCssRecipeOpts,
): { finishShaderId: string | null; varnishShaderId: string | null } {
  if (!POKEMON_CSS_FOIL_SHIPPED) {
    return { finishShaderId: null, varnishShaderId: null };
  }

  const trimmed = (finish ?? "").trim();
  if (!trimmed || /^none$/i.test(trimmed)) {
    return { finishShaderId: null, varnishShaderId: null };
  }

  const withEtch = (id: string) => {
    const paintsOwnEtch = ETCH_PAINT_FINISH_IDS.has(id);
    const varnishId =
      !paintsOwnEtch && varnish && !/^none$/i.test(varnish.trim())
        ? ETCH_VARNISH_CSS_ID
        : null;
    return {
      finishShaderId: id,
      varnishShaderId: varnishId,
    };
  };

  const finishId = (id: string) =>
    withEtch(applyFoilMaskCss(id, opts?.foilMask));

  const exact = resolveLiveFinishCssId(trimmed);
  if (exact) {
    return finishId(exact);
  }

  const live = foilManifestToShader(trimmed);
  if (live === "NonFoil") {
    return { finishShaderId: null, varnishShaderId: null };
  }
  if (live) {
    const fromLive = resolveLiveFinishCssId(live);
    if (fromLive) return finishId(fromLive);
  }

  const catalogue = CATALOGUE[trimmed.toLowerCase()];
  if (catalogue) {
    return finishId(catalogue);
  }

  return finishId(DEFAULT_FINISH_CSS_ID);
}
