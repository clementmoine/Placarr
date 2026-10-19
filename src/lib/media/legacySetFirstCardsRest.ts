/**
 * Pre–lang-first Item / Metadata URLs still point at
 * `cards/{set}/{lang}/{card}/…` while disk is `cards/{lang}/{set}/{card}/…`
 * (Dragon Ball CG/JCC, Naruto after cutover, Pokémon, …).
 *
 * Remap at serve time so stale sqlite rows keep rendering without a mass
 * rewrite.
 */

const ASSET_LANGS = new Set([
  "fr",
  "en",
  "ja",
  "jp",
  "de",
  "it",
  "es",
  "pt",
  "pt-br",
  "ptbr",
  "ko",
  "zh",
  "zh-cn",
  "zh-tw",
  "nl",
  "pl",
  "ru",
]);

function isAssetLang(segment: string): boolean {
  return ASSET_LANGS.has(segment.trim().toLowerCase());
}

/**
 * `cards/{set}/{lang}/{card}/file…` → `cards/{lang}/{set}/{card}/file…`.
 * Returns `null` when already lang-first or the shape is not a card face path.
 */
export function legacySetFirstCardsRest(
  rest: readonly string[],
): string[] | null {
  if (rest.length < 5 || rest[0] !== "cards") return null;
  const set = rest[1]!;
  const lang = rest[2]!;
  const card = rest[3]!;
  if (!isAssetLang(lang)) return null;
  if (isAssetLang(set)) return null;
  return ["cards", lang.toLowerCase(), set, card, ...rest.slice(4)];
}
