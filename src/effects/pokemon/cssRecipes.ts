/**
 * Pokémon CSS foil — **Live / Unity first** (plaques + intention frag).
 * Simey / forks = analyse only — not the choreography we depend on.
 *
 * Looks live in `holoShadersPokemon` (APK/Live plates) or catalogue-only
 * Simey ids for non-Live finishes (`holo`, `reverse`, …).
 *
 * The print's own foil mask still gates coverage in `HoloCardImage`
 * (`maskedByStyle`), except full-card gold/secret finishes.
 *
 * Live `foil_mask` (CastAndCure / ReverseLaminate*) remaps CSS the same way
 * `applyLiveFoilMask` remaps WebGL — Northern Cross / Poké·Master Ball carves.
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
import type { SimeyHoloShaderId } from "@/core/render/holoShadersSimey";

import { foilManifestToShader } from "./foilNames";

/** Everyday catalogue holo — simey poke-holo `regular-holo.css`. */
export const DEFAULT_FINISH_CSS_ID: SimeyHoloShaderId = "regularHolo";

/** Reverse / parallel sheen — simey `reverse-holo.css`. */
export const REVERSE_FINISH_CSS_ID: SimeyHoloShaderId = "reverseHolo";

/**
 * Live HoloFoil leaf → CSS look (Pokemon / Live plates).
 *
 * Remapped off Simey rarity ids (2026-08-07): Unity compare is the truth.
 * CastAndCure / laminate overrides applied in {@link applyFoilMaskCss}.
 */
export const LIVE_FINISH_CSS: Readonly<
  Record<string, HouseHoloShaderId | PokemonHoloShaderId | SimeyHoloShaderId>
> = {
  RadiantHolo: "radiantHolo",
  SwSecret: "swSecret",
  SwSecreT02: "swSecret",
  Rainbow: "rainbowFoil",
  Rainbow02: "rainbow02",
  Cosmos: "cosmos",
  Galaxy: "galaxy",
  CrackedIce: "crackedIce",
  FlatSilver: "flatSilver",
  FlatSilver_CC: "flatSilverCc",
  SvUltraGoldRainbow: "ultraGoldRainbow",
  SvUltraScodix: "ultraScodix",
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
  "25thConfetti": "confetti25th",
};

/** Finishes that paint Live etch inside the shine stack (no house varnish). */
const ETCH_PAINT_FINISH_IDS = new Set<string>([
  "radiantHolo",
  "ultraGoldRainbow",
  "ultraScodix",
  "swSecret",
  "secretRare",
]);

const CATALOGUE: Readonly<
  Record<string, HouseHoloShaderId | SimeyHoloShaderId | PokemonHoloShaderId>
> = {
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
    /*
      Radiant / Ultra Gold / Scodix / SwSecret paint Live `_CardEtch` inside the
      shine stack. Emitting house `etch` as well double-washes the card.
    */
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

  /*
    The exact leaf first, and this order is load-bearing. `foilManifestToShader`
    collapses sheet aliases onto their `.frag` stem — `FlatSilver_CC` becomes
    `FlatSilver`, `Rainbow02` becomes `Rainbow` — because that is the right
    answer for *shader* lookup. It is the wrong answer here: those leaves bind
    different textures (the Poké Ball laminate, a different spectrum), so
    collapsing first would make their recipes unreachable.
  */
  const exact = LIVE_FINISH_CSS[trimmed];
  if (exact) {
    return finishId(exact);
  }

  const live = foilManifestToShader(trimmed);
  if (live === "NonFoil") {
    return { finishShaderId: null, varnishShaderId: null };
  }
  if (live && LIVE_FINISH_CSS[live]) {
    return finishId(LIVE_FINISH_CSS[live]);
  }

  const catalogue = CATALOGUE[trimmed.toLowerCase()];
  if (catalogue) {
    return finishId(catalogue);
  }

  // Unknown named finish: honest fan default, not a Lorcana silver recipe.
  return finishId(DEFAULT_FINISH_CSS_ID);
}
