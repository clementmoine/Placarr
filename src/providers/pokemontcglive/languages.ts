/**
 * Pokémon TCG Live client / CDN languages (verified 2026-08 via CDN HEAD +
 * Pokémon Company global beta announcement).
 *
 * Bundle stem: `{set}_{lang}_{num}` — Brazilian Portuguese is `ptbr`, not `pt`.
 */
export const POKEMON_LIVE_LANGUAGES = [
  "fr",
  "en",
  "de",
  "it",
  "es",
  "ptbr",
] as const;

export type PokemonLiveLanguage = (typeof POKEMON_LIVE_LANGUAGES)[number];

export const POKEMON_LIVE_DEFAULT_LANGUAGE: PokemonLiveLanguage = "fr";

/**
 * Default CDN scrape langs: finish FR (device catalogue + most complete on
 * disk), then a second pass ``--langs en``. Do not default to all six — that
 * floods CloudFront with AccessDenied for unpublished locale bundles.
 */
export const POKEMON_LIVE_SCRAPE_DEFAULT_LANGUAGES: readonly PokemonLiveLanguage[] =
  [POKEMON_LIVE_DEFAULT_LANGUAGE];

/** Comma form for CLI help / ``--langs`` examples (all Live locales). */
export const POKEMON_LIVE_LANGS_CSV = POKEMON_LIVE_LANGUAGES.join(",");

/** Comma form for scrape CLI default (``fr`` only). */
export const POKEMON_LIVE_SCRAPE_DEFAULT_LANGS_CSV =
  POKEMON_LIVE_SCRAPE_DEFAULT_LANGUAGES.join(",");

export function isPokemonLiveLanguage(
  value: string | null | undefined,
): value is PokemonLiveLanguage {
  return (
    typeof value === "string" &&
    (POKEMON_LIVE_LANGUAGES as readonly string[]).includes(value)
  );
}

/**
 * Live CDN lang → TCGdex API locale.
 * `ptbr` maps to `pt-br` (TCGdex); keep `pt` as a legacy Dex alias separately.
 */
export const LIVE_LANG_TO_TCGDEX = {
  fr: "fr",
  en: "en",
  de: "de",
  it: "it",
  es: "es",
  ptbr: "pt-br",
} as const satisfies Record<PokemonLiveLanguage, string>;

export type LiveTcgdexLanguage =
  (typeof LIVE_LANG_TO_TCGDEX)[PokemonLiveLanguage];

export function tcgdexLangFromLive(
  liveLang: string | null | undefined,
): LiveTcgdexLanguage | null {
  if (!isPokemonLiveLanguage(liveLang)) return null;
  return LIVE_LANG_TO_TCGDEX[liveLang];
}
