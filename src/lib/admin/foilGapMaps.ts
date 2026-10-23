/**
 * Pure helpers for foil gap audits — “upstream added X, Placarr missing map”.
 * Used by `foilGaps.ts` and unit tests (no dump I/O here).
 */

/** kebab-case CSS basename → camelCase look id (`radiant-holo` → `radiantHolo`). */
export function kebabCssStemToCamelId(stem: string): string {
  return stem
    .split("-")
    .filter(Boolean)
    .map((part, i) =>
      i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}

/**
 * Vendored simey card CSS files that are scaffolding or intentionally not
 * ported (one-offs / TG aliases). Keep in sync with `docs/foil_css_sources.md`.
 */
export const SIMEY_CSS_SKIP_STEMS = new Set([
  "base",
  "basic",
  "swsh-pikachu",
  "trainer-full-art",
  "trainer-gallery-v-regular",
  "trainer-gallery-v-max",
  "trainer-gallery-secret-rare",
  "shiny-vmax",
  "ex-special-illustration-rare",
]);

export type SimeyCssGap = {
  tree: string;
  stem: string;
  expectedId: string;
};

/**
 * Report vendored rarity CSS files with no matching Placarr look id.
 * `portedIds` = union of simey + pokemon (Radiant) HoloShader ids.
 */
export function simeyCssGaps(input: {
  files: Array<{ tree: string; stem: string }>;
  portedIds: ReadonlySet<string>;
  skipStems?: ReadonlySet<string>;
}): SimeyCssGap[] {
  const skip = input.skipStems ?? SIMEY_CSS_SKIP_STEMS;
  const gaps: SimeyCssGap[] = [];
  for (const { tree, stem } of input.files) {
    if (skip.has(stem)) continue;
    const expectedId = kebabCssStemToCamelId(stem);
    const hit =
      input.portedIds.has(expectedId) ||
      [...input.portedIds].some(
        (id) => id === expectedId || id.startsWith(`${expectedId}`),
      );
    if (!hit) gaps.push({ tree, stem, expectedId });
  }
  return gaps.sort(
    (a, b) => a.tree.localeCompare(b.tree) || a.stem.localeCompare(b.stem),
  );
}

/** Live leaves with a Simey-backed CSS look (others → flare by policy). */
export function liveLeavesMissingCssMap(input: {
  foilNames: readonly string[];
  sheetAliases: readonly string[];
  liveFinishCss: Readonly<Record<string, string>>;
  skip?: ReadonlySet<string>;
}): string[] {
  const skip = input.skip ?? new Set(["NonFoil"]);
  const need = [...input.foilNames, ...input.sheetAliases].filter(
    (n) => !skip.has(n),
  );
  return need.filter((n) => !input.liveFinishCss[n]).sort();
}

/** Foiled Live leaves that need a `SHARED_BY_FOIL` motif map for WebGL. */
export function liveLeavesMissingSharedMotifs(input: {
  foilNames: readonly string[];
  sheetAliases: readonly string[];
  hasShared: (name: string) => boolean;
  skip?: ReadonlySet<string>;
}): string[] {
  const skip = input.skip ?? new Set(["NonFoil"]);
  const need = [...input.foilNames, ...input.sheetAliases].filter(
    (n) => !skip.has(n),
  );
  return need.filter((n) => !input.hasShared(n)).sort();
}

/** Dump `.frag` stems not yet in `POKEMON_FOIL_NAMES`. */
export function extraLiveFragStems(
  dumpFrags: readonly string[],
  foilNames: readonly string[],
): string[] {
  const known = new Set(foilNames);
  return [...dumpFrags].filter((f) => !known.has(f)).sort();
}

/**
 * Viewer CSS chrome (nav / chrome) — not foil textures. Keep out of actionable
 * Lorcana web-stem gaps.
 */
export const LORCANA_WEB_CHROME_STEMS = new Set([
  "frame",
  "menu",
  "logo",
  "icon",
  "favicon",
]);

/**
 * Catalogue finishes / varnishes that only hit pack CSS defaults.
 * `isFallbackOnly` is pack-owned (see `effects/lorcana/cssRecipes`).
 */
export function lorcanaCatalogueCssGaps(input: {
  finishes: readonly string[];
  varnishes: readonly string[];
  isFinishFallbackOnly: (finish: string) => boolean;
  isVarnishFallbackOnly: (varnish: string) => boolean;
}): { finishes: string[]; varnishes: string[] } {
  const finishes = [
    ...new Set(input.finishes.filter((f) => input.isFinishFallbackOnly(f))),
  ].sort();
  const varnishes = [
    ...new Set(input.varnishes.filter((v) => input.isVarnishFallbackOnly(v))),
  ].sort();
  return { finishes, varnishes };
}

/** Web dump stems to review (unknown foil texture, not chrome). */
export function lorcanaWebStemGaps(input: {
  unlistedStems: readonly string[];
  chromeStems?: ReadonlySet<string>;
}): string[] {
  const chrome = input.chromeStems ?? LORCANA_WEB_CHROME_STEMS;
  return [...input.unlistedStems]
    .filter((s) => s && !chrome.has(s.toLowerCase()))
    .sort();
}
