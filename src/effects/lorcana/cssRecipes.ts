/**
 * Lorcana web CSS recipes — pack-specific defaults live here, not in core.
 *
 * Resolve: alias overrides → FinishName → camelCase id if ported → house flare.
 * Unknown catalogue finishes still render (`flare`) but gap audit flags them —
 * same honesty model as Pokémon CSS.
 */

import { HOUSE_FOIL_FALLBACK_CSS_ID } from "@/core/render/foil/houseFoilFallback";
import { HOLO_SHADER_IDS, type HoloShaderId } from "@/core/render/holoShaders";

/** Where transcribed CSS foil textures live for this pack. */
export const WEB_TEXTURE_BASE = "/assets/lorcana/web";

/** Unknown catalogue finish → shared house flare (not Lorcana silver texture). */
export const DEFAULT_FINISH_CSS_ID = HOUSE_FOIL_FALLBACK_CSS_ID;

/** Stamped coat when the varnish type has no dedicated CSS look. */
export const DEFAULT_VARNISH_CSS_ID = "hotFoil";

const PORTED = new Set<string>(HOLO_SHADER_IDS);

/** Irregular catalogue finish → shader id. */
const FINISH_CSS_ALIASES: Readonly<Record<string, string>> = {
  VertWave: "verticalWave",
  VerticalWave: "verticalWave",
  FreeForm1: "freeForm",
  FreeForm2: "freeForm",
  RainbowPillars: "rainbowPillars",
  CalendarWave: "calendarWave",
  SeaWave: "seaWave",
};

const VARNISH_CSS_ALIASES: Readonly<Record<string, string>> = {
  ChromeRainbowHotFoil: "chromeRainbowHotFoil",
};

function toCamelFinish(name: string): string {
  if (!name) return "";
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** True when finish has a dedicated ported look (alias or camelCase id). */
export function hasDedicatedCssFinish(finish: string): boolean {
  const trimmed = finish.trim();
  if (!trimmed || /^none$/i.test(trimmed)) return false;
  const alias = FINISH_CSS_ALIASES[trimmed];
  if (alias && PORTED.has(alias)) return true;
  const camel = toCamelFinish(trimmed);
  return PORTED.has(camel);
}

/**
 * Catalogue finish that only hits house flare — port a look or add an alias.
 * `Silver` / `None` / empty are not gaps (`Silver` has a dedicated look).
 */
export function isCssFinishFallbackOnly(finish: string): boolean {
  const trimmed = finish.trim();
  if (!trimmed || /^none$/i.test(trimmed)) return false;
  if (hasDedicatedCssFinish(trimmed)) return false;
  return resolveFinishId(trimmed) === DEFAULT_FINISH_CSS_ID;
}

/** HighGloss / *HotFoil share the stamped-coat CSS family — not a gap. */
export function isVarnishHotFoilFamily(varnish: string): boolean {
  return /hotfoil/i.test(varnish) || /highgloss/i.test(varnish);
}

/** True when varnish has a dedicated look (not merely the hotFoil family). */
export function hasDedicatedCssVarnish(varnish: string): boolean {
  const trimmed = varnish.trim();
  if (!trimmed) return false;
  const alias = VARNISH_CSS_ALIASES[trimmed];
  if (alias && PORTED.has(alias)) return true;
  const camel = toCamelFinish(trimmed);
  if (PORTED.has(camel) && camel !== DEFAULT_VARNISH_CSS_ID) return true;
  return false;
}

/**
 * Varnish that silently maps to hotFoil without being HotFoil/HighGloss family
 * or a dedicated port (e.g. a future coat name).
 */
export function isCssVarnishFallbackOnly(varnish: string): boolean {
  const trimmed = varnish.trim();
  if (!trimmed) return false;
  if (hasDedicatedCssVarnish(trimmed)) return false;
  if (isVarnishHotFoilFamily(trimmed)) return false;
  return true;
}

function resolveFinishId(finish: string): string {
  const alias = FINISH_CSS_ALIASES[finish];
  if (alias) return alias;
  const camel = toCamelFinish(finish);
  if (PORTED.has(camel)) return camel;
  return DEFAULT_FINISH_CSS_ID;
}

function resolveVarnishId(varnish: string): string {
  const alias = VARNISH_CSS_ALIASES[varnish];
  if (alias) return alias;
  const camel = toCamelFinish(varnish);
  if (PORTED.has(camel)) return camel;
  // HotFoil family → hotFoil
  if (isVarnishHotFoilFamily(varnish)) {
    return DEFAULT_VARNISH_CSS_ID;
  }
  return DEFAULT_VARNISH_CSS_ID;
}

/** @deprecated Prefer resolve; snapshot for tests. */
export const FINISH_CSS: Readonly<Record<string, string>> = {
  Silver: "silver",
  Satin: "satin",
  Lore: "lore",
  Lava: "lava",
  Magma: "magma",
  Glitter: "glitter",
  VerticalWave: "verticalWave",
  VertWave: "verticalWave",
  SeaWave: "seaWave",
  RainbowPillars: "rainbowPillars",
  FreeForm1: "freeForm",
  FreeForm2: "freeForm",
  Tempest: "tempest",
  CalendarWave: "calendarWave",
};

/** @deprecated Prefer resolve. */
export const VARNISH_CSS: Readonly<Record<string, string>> = {
  HighGloss: "hotFoil",
  MatteHotFoil: "hotFoil",
  MetallicHotFoil: "hotFoil",
  SnowHotFoil: "hotFoil",
  RainbowHotFoil: "hotFoil",
  ChromeRainbowHotFoil: "chromeRainbowHotFoil",
};

export function resolveCssRecipe(
  finish: string,
  varnish: string | null | undefined,
): { finishShaderId: string | null; varnishShaderId: string | null } {
  const trimmed = finish.trim();
  const finishShaderId = trimmed ? resolveFinishId(trimmed) : null;
  const varnishShaderId = varnish ? resolveVarnishId(varnish.trim()) : null;
  return {
    finishShaderId: finishShaderId as HoloShaderId | string | null,
    varnishShaderId,
  };
}

/**
 * Texture basenames under `/assets/lorcana/web/` used by ported CSS looks.
 * DumpWeb treats other image stems as candidates for review (minus chrome).
 */
export function lorcanaWebRecipeTextureStems(): ReadonlySet<string> {
  // Keep explicit: matches `holoShaders.ts` `T` urls (parity-tested).
  return new Set([
    "silverc",
    "satin",
    "satinc",
    "satind",
    "vertwavec",
    "vertwave",
    "lava2",
    "magma",
    "glitter",
    "ff2c",
    "ff2",
    "seawavec",
    "seawave",
    "pillar",
    "pillar2",
    "color",
    "tempest",
    "calc",
    "calendarwave",
    "lore",
  ]);
}
