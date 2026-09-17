/**
 * Official pokemon.com encyclopédie card image URLs (mcdn).
 *
 * Prefer cms3 `cards/full` (HQ when present), else cms2 `cards/web` (complete
 * but ~245×342). Locales: FR → `cms3/fr` + `cms2-fr-fr`; EN → `cms3/us` + `cms2`.
 */
export type McdnLocale = "fr" | "en";

const CMS3_BASE =
  "https://mcdn.pokemon.com/image/upload/c_limit,w_2000/f_auto/q_auto:best/v1/live/pcom-cms/static-assets/cms3";
const CMS2_BASE =
  "https://mcdn.pokemon.com/image/upload/c_limit,w_2000/f_auto/q_auto:best/v1/live/static-assets/content-assets";

export function pokemonMcdnCms3Locale(lang: McdnLocale): "fr" | "us" {
  return lang === "en" ? "us" : "fr";
}

export function pokemonMcdnCms2Bucket(lang: McdnLocale): string {
  return lang === "en" ? "cms2" : "cms2-fr-fr";
}

export function pokemonMcdnCardLangToken(lang: McdnLocale): "FR" | "EN" {
  return lang === "en" ? "EN" : "FR";
}

/** Unpadded collector number as used on pokemon.com CDN (`4`, `33`, `158`). */
export function pokemonMcdnCardNumber(localId: string | number): string {
  const raw = String(localId).trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return String(Number.parseInt(digits, 10));
}

export function pokemonMcdnCms3Url(
  galleryCode: string,
  lang: McdnLocale,
  localId: string | number,
): string {
  const code = galleryCode.trim();
  const loc = pokemonMcdnCms3Locale(lang);
  const token = pokemonMcdnCardLangToken(lang);
  const num = pokemonMcdnCardNumber(localId);
  return `${CMS3_BASE}/${loc}/img/cards/full/${code}/${code}_${token}_${num}.png`;
}

export function pokemonMcdnCms2Url(
  galleryCode: string,
  lang: McdnLocale,
  localId: string | number,
): string {
  const code = galleryCode.trim();
  const bucket = pokemonMcdnCms2Bucket(lang);
  const token = pokemonMcdnCardLangToken(lang);
  const num = pokemonMcdnCardNumber(localId);
  return `${CMS2_BASE}/${bucket}/img/cards/web/${code}/${code}_${token}_${num}.png`;
}

/** Prefer HQ cms3, then encyclopédie cms2 web. */
export function pokemonMcdnCandidateUrls(
  galleryCode: string,
  lang: McdnLocale,
  localId: string | number,
): string[] {
  return [
    pokemonMcdnCms3Url(galleryCode, lang, localId),
    pokemonMcdnCms2Url(galleryCode, lang, localId),
  ];
}
