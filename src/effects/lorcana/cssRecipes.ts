/**
 * Lorcana web CSS resolve — finish/varnish → look ids from dumpWeb recipes.json.
 *
 * Resolve: Unity aliases → dump finishMap → camelCase look if present → flare.
 * Unknown catalogue finishes still render (`flare`) but gap audit flags them.
 */

import { HOUSE_FOIL_FALLBACK_CSS_ID } from "@/core/render/foil/backend";
import {
  HOLO_SHADER_IDS,
  type HoloShaderId,
} from "@/core/render/holoShaderIds";
import { loadLorcanaWebRecipes } from "@/lib/foilMetaLoad";
import {
  LORCANA_WEB_TEXTURE_BASE,
  textureStemsFromRecipes,
  type LorcanaWebRecipesFile,
} from "@/providers/lorcana/lorcanatcg/pipeline/webRecipes";

/** Where dumped CSS foil textures live for this pack. */
export const WEB_TEXTURE_BASE = LORCANA_WEB_TEXTURE_BASE;

/** Unknown catalogue finish → shared house flare (not Lorcana silver texture). */
export const DEFAULT_FINISH_CSS_ID = HOUSE_FOIL_FALLBACK_CSS_ID;

/** Stamped coat when the varnish type has no dedicated CSS look. */
export const DEFAULT_VARNISH_CSS_ID = "hotFoil";

/** Irregular catalogue / Unity names → dump look id. */
const FINISH_CSS_ALIASES: Readonly<Record<string, string>> = {
  VertWave: "verticalWave",
  // Mis-peeled Unity leaf before `VarnishFoil` was a varnish suffix.
  FreeForm2Varnish: "freeForm",
};

function toCamelFinish(name: string): string {
  if (!name) return "";
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function dumpedRecipes(): LorcanaWebRecipesFile {
  const raw = loadLorcanaWebRecipes();
  return {
    version: 1,
    looks: raw.looks ?? {},
    finishMap: raw.finishMap ?? {},
    varnishMap: raw.varnishMap ?? {},
  };
}

function lookExists(id: string): boolean {
  if (dumpedRecipes().looks[id]) return true;
  return (HOLO_SHADER_IDS as readonly string[]).includes(id);
}

/** Dump finishMap + Unity aliases (for tests / audits). */
export function finishCssMap(): Readonly<Record<string, string>> {
  return {
    ...dumpedRecipes().finishMap,
    ...FINISH_CSS_ALIASES,
  };
}

/** Dump varnishMap (for tests / audits). */
export function varnishCssMap(): Readonly<Record<string, string>> {
  return { ...dumpedRecipes().varnishMap };
}

/**
 * @deprecated Prefer {@link finishCssMap} / resolve.
 * Snapshot getter so `Object.entries(FINISH_CSS)` still works in tests.
 */
export const FINISH_CSS: Readonly<Record<string, string>> = new Proxy(
  {} as Record<string, string>,
  {
    ownKeys: () => Reflect.ownKeys(finishCssMap()),
    get: (_t, prop: string | symbol) =>
      typeof prop === "string" ? finishCssMap()[prop] : undefined,
    getOwnPropertyDescriptor: (_t, prop: string | symbol) => {
      if (typeof prop !== "string") return undefined;
      const value = finishCssMap()[prop];
      if (value == null) return undefined;
      return { configurable: true, enumerable: true, value };
    },
    has: (_t, prop: string | symbol) =>
      typeof prop === "string" && prop in finishCssMap(),
  },
);

/** @deprecated Prefer {@link varnishCssMap} / resolve. */
export const VARNISH_CSS: Readonly<Record<string, string>> = new Proxy(
  {} as Record<string, string>,
  {
    ownKeys: () => Reflect.ownKeys(varnishCssMap()),
    get: (_t, prop: string | symbol) =>
      typeof prop === "string" ? varnishCssMap()[prop] : undefined,
    getOwnPropertyDescriptor: (_t, prop: string | symbol) => {
      if (typeof prop !== "string") return undefined;
      const value = varnishCssMap()[prop];
      if (value == null) return undefined;
      return { configurable: true, enumerable: true, value };
    },
    has: (_t, prop: string | symbol) =>
      typeof prop === "string" && prop in varnishCssMap(),
  },
);

/** True when finish has a dedicated ported look (alias, dump map, or camelCase). */
export function hasDedicatedCssFinish(finish: string): boolean {
  const trimmed = finish.trim();
  if (!trimmed || /^none$/i.test(trimmed)) return false;
  const alias = FINISH_CSS_ALIASES[trimmed];
  if (alias && lookExists(alias)) return true;
  const fromDump = dumpedRecipes().finishMap[trimmed];
  if (fromDump && lookExists(fromDump)) return true;
  const camel = toCamelFinish(trimmed);
  return lookExists(camel);
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

/** HighGloss / *HotFoil / Unity `VarnishFoil` share the stamped-coat CSS family. */
export function isVarnishHotFoilFamily(varnish: string): boolean {
  return (
    /hotfoil/i.test(varnish) ||
    /highgloss/i.test(varnish) ||
    /^varnishfoil$/i.test(varnish)
  );
}

/** True when varnish has a dedicated look (not merely the hotFoil family). */
export function hasDedicatedCssVarnish(varnish: string): boolean {
  const trimmed = varnish.trim();
  if (!trimmed) return false;
  const fromDump = dumpedRecipes().varnishMap[trimmed];
  if (fromDump && fromDump !== DEFAULT_VARNISH_CSS_ID && lookExists(fromDump)) {
    return true;
  }
  const camel = toCamelFinish(trimmed);
  if (lookExists(camel) && camel !== DEFAULT_VARNISH_CSS_ID) return true;
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
  if (alias && lookExists(alias)) return alias;
  const fromDump = dumpedRecipes().finishMap[finish];
  if (fromDump && lookExists(fromDump)) return fromDump;
  const camel = toCamelFinish(finish);
  if (lookExists(camel)) return camel;
  return DEFAULT_FINISH_CSS_ID;
}

function resolveVarnishId(varnish: string): string {
  const fromDump = dumpedRecipes().varnishMap[varnish];
  if (fromDump && lookExists(fromDump)) return fromDump;
  const camel = toCamelFinish(varnish);
  if (lookExists(camel)) return camel;
  if (isVarnishHotFoilFamily(varnish)) {
    return DEFAULT_VARNISH_CSS_ID;
  }
  return DEFAULT_VARNISH_CSS_ID;
}

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
 * Texture basenames under `/assets/lorcana/web/` used by dumped CSS looks.
 * DumpWeb treats other image stems as candidates for review (minus chrome).
 */
export function lorcanaWebRecipeTextureStems(): ReadonlySet<string> {
  return textureStemsFromRecipes(dumpedRecipes());
}
