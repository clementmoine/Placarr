/**
 * CCG Trader (ccgtrader.net) — Directus-backed community CCG database.
 *
 * SPA shells at `/games/{url_title}`; live index via
 * `api.ccgtrader.co.uk/_/items/game`. Card art = Directus assets
 * (`/_/assets/{id}`), same family as Vintage Naruto.
 *
 * Shared stays provider-blind: call sites pass the site `url_title`.
 */

export const CCGTRADER_WWW_ORIGIN = "https://www.ccgtrader.net";
export const CCGTRADER_API_ORIGIN = "https://api.ccgtrader.co.uk";

/** Directus REST under `/_/` (bare `/items/…` is 403). */
export const CCGTRADER_ITEMS_BASE = `${CCGTRADER_API_ORIGIN}/_/items`;

export function ccgtraderGamePageUrl(urlTitle: string): string {
  return `${CCGTRADER_WWW_ORIGIN}/games/${urlTitle}`;
}

export function ccgtraderAssetUrl(
  assetId: string,
  key?: "card-medium" | "card-large" | "directus-medium-contain",
): string {
  const base = `${CCGTRADER_API_ORIGIN}/_/assets/${assetId}`;
  return key ? `${base}?key=${key}` : base;
}

/** Fields the SPA loads for a game page (series → sets). */
export const CCGTRADER_GAME_FIELDS = [
  "id",
  "name",
  "url_title",
  "publisher",
  "publication_date",
  "in_print",
  "languages",
  "website",
  "description",
  "logo.data.asset_url",
  "series.id",
  "series.sort",
  "series.name",
  "series.sets.id",
  "series.sets.status",
  "series.sets.sort",
  "series.sets.name",
  "series.sets.url_title",
  "series.sets.release_date",
  "series.sets.svg_icon",
  "series.sets.logo",
  "series.sets.logo_url",
] as const;
