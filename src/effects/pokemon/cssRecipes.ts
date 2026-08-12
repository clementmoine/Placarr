/**
 * Pokémon CSS foil — **Live / Unity first** (plaques + intention frag).
 * Simey / forks = analyse only — not the choreography we depend on.
 *
 * Resolve: known irregular aliases → Pascal leaf → camelCase if ported → default.
 * New dumped leaves without a ported look fall back honestly (gap audit).
 */

/**
 * Whether the CSS fallback is live in product UI.
 *
 * Kept as a flag rather than deleted: it is the one switch that returns every
 * Pokémon surface to plain if the masked looks turn out wrong somewhere, and
 * the guard test pins what it must never do in either position.
 */
export const POKEMON_CSS_FOIL_SHIPPED = true;

import { HOUSE_HOLO_SHADER_IDS } from "@/core/render/holoShadersHouse";
import type { HouseHoloShaderId } from "@/core/render/holoShadersHouse";
import {
  POKEMON_HOLO_SHADER_IDS,
  type PokemonHoloShaderId,
} from "@/core/render/holoShadersPokemon";
import {
  SIMEY_HOLO_SHADER_IDS,
  type SimeyHoloShaderId,
} from "@/core/render/holoShadersSimey";

import { foilManifestToShader } from "./foilNames";

/** Everyday catalogue holo — simey poke-holo `regular-holo.css`. */
export const DEFAULT_FINISH_CSS_ID: SimeyHoloShaderId = "regularHolo";

/** Reverse / parallel sheen — simey `reverse-holo.css`. */
export const REVERSE_FINISH_CSS_ID: SimeyHoloShaderId = "reverseHolo";

type CssLookId = HouseHoloShaderId | PokemonHoloShaderId | SimeyHoloShaderId;

const PORTED_CSS_IDS = new Set<string>([
  ...HOUSE_HOLO_SHADER_IDS,
  ...POKEMON_HOLO_SHADER_IDS,
  ...SIMEY_HOLO_SHADER_IDS,
]);

/**
 * Irregular Live leaf → CSS id (where `RadiantHolo`→`radiantHolo` is wrong).
 */
const LIVE_FINISH_CSS_ALIASES: Readonly<Record<string, CssLookId>> = {
  Rainbow: "rainbowFoil",
  Rainbow02: "rainbow02",
  SwSecreT02: "swSecret",
  FlatSilver_CC: "flatSilverCc",
  SvUltraGoldRainbow: "ultraGoldRainbow",
  SvUltraScodix: "ultraScodix",
  "25thConfetti": "confetti25th",
};

function leafToCamelCssId(leaf: string): string {
  if (!leaf) return "";
  return leaf.charAt(0).toLowerCase() + leaf.slice(1);
}

function isPortedCssId(id: string): id is CssLookId {
  return PORTED_CSS_IDS.has(id);
}

/** Resolve Live leaf → ported CSS id without catalogue / default. */
export function resolveLiveFinishCssId(leaf: string): CssLookId | null {
  const trimmed = leaf.trim();
  if (!trimmed) return null;
  const alias = LIVE_FINISH_CSS_ALIASES[trimmed];
  if (alias) return alias;
  const camel = leafToCamelCssId(trimmed);
  if (isPortedCssId(camel)) return camel;
  return null;
}

/**
 * Snapshot of leaf→id for guards / audits (aliases + convention for known leaves).
 * Prefer {@link resolveLiveFinishCssId} for runtime.
 */
export const LIVE_FINISH_CSS: Readonly<Record<string, CssLookId>> = {
  ...LIVE_FINISH_CSS_ALIASES,
  RadiantHolo: "radiantHolo",
  SwSecret: "swSecret",
  Cosmos: "cosmos",
  Galaxy: "galaxy",
  CrackedIce: "crackedIce",
  FlatSilver: "flatSilver",
  SvUltra: "svUltra",
  SvHolo: "svHolo",
  SwHolo: "swHolo",
  AceFoil: "aceFoil",
  AngledPillars: "angledPillars",
  SunPillar: "sunPillar",
  SunBeam: "sunBeam",
  SunLava: "sunLava",
  SolidColor: "solidColor",
  Squares: "squares",
  Thatch: "thatch",
  Tinsel: "tinsel",
  Stamped: "stamped",
};

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
  "ultraGoldRainbow",
  "ultraScodix",
  "swSecret",
  "secretRare",
]);

const CATALOGUE: Readonly<Record<string, CssLookId>> = {
  holo: DEFAULT_FINISH_CSS_ID,
  reverse: REVERSE_FINISH_CSS_ID,
  firstedition: DEFAULT_FINISH_CSS_ID,
  wpromo: DEFAULT_FINISH_CSS_ID,
  "live-std": DEFAULT_FINISH_CSS_ID,
  "live-ph": REVERSE_FINISH_CSS_ID,
  cosmos: "cosmos",
  rainbow: "rainbowFoil",
  amazing: "galaxy",
  secret: "swSecret",
  shiny: "flatSilver",
  v: "swHolo",
  vmax: "aceFoil",
  vstar: "svHolo",
  pokeball: "flatSilverCc",
  masterball: "flatSilverCcMb",
  ex: "angledPillars",
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
    (finishShaderId === "flatSilver" || finishShaderId === "flatSilverCc") &&
    mask === "ReverseLaminatePokeBall"
  ) {
    return "flatSilverCc";
  }
  if (
    (finishShaderId === "flatSilver" ||
      finishShaderId === "flatSilverCc" ||
      finishShaderId === "flatSilverCcMb") &&
    mask === "ReverseLaminateMasterBall"
  ) {
    return "flatSilverCcMb";
  }
  return finishShaderId;
}

export function resolveCssRecipe(
  finish: string,
  _varnish: string | null | undefined,
  opts?: ResolveCssRecipeOpts,
): { finishShaderId: string | null; varnishShaderId: string | null } {
  if (!POKEMON_CSS_FOIL_SHIPPED) {
    return { finishShaderId: null, varnishShaderId: null };
  }

  const trimmed = finish.trim();
  if (!trimmed) {
    return { finishShaderId: null, varnishShaderId: null };
  }

  const withEtch = (finishShaderId: string | null) => {
    if (finishShaderId && ETCH_PAINT_FINISH_IDS.has(finishShaderId)) {
      return { finishShaderId, varnishShaderId: null };
    }
    return {
      finishShaderId,
      varnishShaderId: finishShaderId ? ETCH_VARNISH_CSS_ID : null,
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
