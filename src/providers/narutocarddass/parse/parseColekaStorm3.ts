/**
 * Coleka FR scans for Bandai USA CCG late series (Sage's Legacy s24,
 * Ultimate Ninja Storm 3 s28).
 *
 * Coleka prints EU prefixes `NI-` / `JU-` / `MI-`. Those are the same cards
 * as EN `N/J/M` (and the same collector family as Carddass `NI/TE/TA`). Disk
 * ids stay `n1358` / `j895` / `m855` so files land beside the EN pack, never
 * `ni1358`.
 *
 * Do not scrape the parent umbrella `_r4102` (~7000 mixed cards). Each
 * série listing is its own branch (`_r15466` s24, `_r16649` s28).
 */
import { STORM3_SET } from "./parseStorm3Shop";

export { STORM3_SET };

export const SAGES_LEGACY_SET = "s24";
export const COLEKA_CCG_FR_LANG = "fr";
export const COLEKA_STORM3_LANG = COLEKA_CCG_FR_LANG;
export const COLEKA_ORIGIN = "https://www.coleka.com";
export const COLEKA_SAGES_LEGACY_LISTING_PATH =
  "/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/cartes-naruto-serie-24-sage-s-legacy_r15466";
export const COLEKA_STORM3_LISTING_PATH =
  "/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/cartes-naruto-serie-28_r16649";
/** Deck spécial FR « La tempête approche » (Rampage Tornado) — 33 reprints, not a set dump. */
export const COLEKA_RAMPAGE_TORNADO_LISTING_PATH =
  "/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/deck-special-naruto-la-tempete-approche-rampage-tornado_r16963";
export const RAMPAGE_TORNADO_SET = "s11";
/** Display / deck packshot Coleka uses for the special deck branch. */
export const COLEKA_RAMPAGE_TORNADO_SET_COVER_URL =
  "https://thumbs.coleka.com/media/rubrique/202012/20/cartes-de-collection-cartes-anime-manga-naruto-cartes-a-jouer-et-a-collectionner-cartes-naruto-deck-special-approche-du-vent-rampage-tornado.webp";
/** Display packshot Coleka uses for Série 24 (box + booster). Already SKU display-s24. */
export const COLEKA_SAGES_LEGACY_SET_COVER_URL =
  "https://thumbs.coleka.com/media/rubrique/202010/14/cartes-de-collection-cartes-anime-manga-naruto-cartes-a-jouer-et-a-collectionner-cartes-naruto-serie-24-sage-s-legacy.webp";
/** Display packshot Coleka uses for Série 28 (box + booster). */
export const COLEKA_STORM3_SET_COVER_URL =
  "https://thumbs.coleka.com/media/rubrique/202012/05/cartes-de-collection-cartes-anime-manga-naruto-cartes-a-jouer-et-a-collectionner-carte-naruto-serie-28.webp";

export type ColekaStorm3Card = {
  /** Disk / print id: `n1650`, never `ni1650`. */
  number: string;
  cardType: "n" | "j" | "m" | "c" | "mus";
  /** Printed Coleka ref: `NI-1650` / `CL-045` / `MI-US086`. */
  colekaRef: string;
  name: string;
  colekaId: string;
  pagePath: string;
  thumbUrl: string;
  faceUrl: string;
};

const PREFIX_TO_TYPE = {
  ni: "n",
  ju: "j",
  mi: "m",
} as const;

function decodeEntities(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCharCode(Number.parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `NI-1650` / `JU-1002` / `MI-976` → `n1650` / `j1002` / `m976`.
 * Returns null for Carddass `TE`/`TA`/`CL` so a grab-bag listing cannot leak.
 */
export function colekaEuPrefixToCollector(raw: string): string | null {
  const m = /^(NI|JU|MI)[\s-]*(\d{3,4})$/i.exec(raw.trim());
  if (!m) return null;
  const letter =
    PREFIX_TO_TYPE[m[1]!.toLowerCase() as keyof typeof PREFIX_TO_TYPE];
  return `${letter}${m[2]}`;
}

/**
 * Rampage Tornado Coleka refs → disk collectors.
 *
 * Same NI/JU/MI → n/j/m trap as Storm 3, plus deck-only:
 * - `CL-045` = EN CCG Characteristic `C-045` (not Carddass CL)
 * - `MI-US086` = `mus0086`
 */
export function colekaRampagePrefixToCollector(raw: string): string | null {
  const trimmed = raw.trim();
  const us = /^(NI|JU|MI)[\s-]*US[\s-]*(\d{2,4})$/i.exec(trimmed);
  if (us) {
    const letter =
      PREFIX_TO_TYPE[us[1]!.toLowerCase() as keyof typeof PREFIX_TO_TYPE];
    const digits = String(Number.parseInt(us[2]!, 10)).padStart(4, "0");
    return `${letter}us${digits}`;
  }
  const cl = /^CL[\s-]*(\d{2,4})$/i.exec(trimmed);
  if (cl) {
    const digits = String(Number.parseInt(cl[1]!, 10)).padStart(4, "0");
    return `c${digits}`;
  }
  const base = colekaEuPrefixToCollector(trimmed);
  if (!base) return null;
  // Storm 3 keeps unpadded (`n1650`); disk ids pad — normalize here for reprints.
  const letter = base[0]!;
  const digits = String(Number.parseInt(base.slice(1), 10)).padStart(4, "0");
  return `${letter}${digits}`;
}

function cardTypeOfNumber(
  number: string,
): ColekaStorm3Card["cardType"] | null {
  if (/^(?:[njm]us)/i.test(number)) return "mus";
  const letter = number[0]?.toLowerCase();
  if (letter === "n" || letter === "j" || letter === "m" || letter === "c") {
    return letter;
  }
  return null;
}

/** Listing thumbs are `_250x250.webp`; the full face is the same path without the size suffix. */
export function colekaFullFaceUrl(thumbUrl: string): string {
  return thumbUrl.replace(/_\d+x\d+(?=\.(?:webp|jpe?g|png|gif)(?:\?|$))/i, "");
}

export function colekaHtmlIsVerifyWall(html: string): boolean {
  // FR « Vérification », IT « Verifica », EN turnstile interstitial.
  if (/<title>\s*V[eé]rifica(?:tion)?\b/i.test(html)) return true;
  if (
    /challenges\.cloudflare\.com\/turnstile/i.test(html) &&
    !/class="[^"]*lib_has_2_lines/i.test(html)
  ) {
    return true;
  }
  return (
    /\/verify\/\?lang=/i.test(html) &&
    !/class="[^"]*lib_has_2_lines/i.test(html)
  );
}

/**
 * Coleka paginates 48-per-page (`?p=1` is page 2). Page 1 is often a Cloudflare
 * cache HIT; later pages tend to trip the verify wall. `nbpp=240` is uncached.
 */
export function colekaCcgFrListingPageUrls(listingPath: string): string[] {
  const base = `${COLEKA_ORIGIN}${listingPath}`;
  return [base, `${base}?p=1`, `${base}?p=2`];
}

export function colekaSagesLegacyListingPageUrls(): string[] {
  return colekaCcgFrListingPageUrls(COLEKA_SAGES_LEGACY_LISTING_PATH);
}

export function colekaStorm3ListingPageUrls(): string[] {
  return colekaCcgFrListingPageUrls(COLEKA_STORM3_LISTING_PATH);
}

export function colekaRampageTornadoListingPageUrls(): string[] {
  // 33 cards fit on page 1; still try p=1 in case Coleka paginates.
  return colekaCcgFrListingPageUrls(COLEKA_RAMPAGE_TORNADO_LISTING_PATH);
}

const ITEM_RE =
  /<a\s([^>]*class="[^"]*lib_has_2_lines[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;

export function parseColekaStorm3Listing(html: string): ColekaStorm3Card[] {
  const byNumber = new Map<string, ColekaStorm3Card>();
  for (const match of html.matchAll(ITEM_RE)) {
    const attrs = match[1]!;
    const inner = match[2]!;
    const ref = inner.match(
      /<span class="ref">\s*Ref\.\s*(NI|JU|MI)-(\d{3,4})\s*<\/span>/i,
    );
    if (!ref) continue;
    const colekaRef = `${ref[1]!.toUpperCase()}-${ref[2]}`;
    const number = colekaEuPrefixToCollector(colekaRef);
    if (!number || byNumber.has(number)) continue;
    const title = inner.match(/<h3 class="product-title">([^<]+)<\/h3>/i);
    const img = inner.match(
      /<img[^>]+src="(https:\/\/thumbs\.coleka\.com\/media\/item\/[^"]+)"/i,
    );
    const href = attrs.match(/\bhref="([^"]+)"/i)?.[1];
    if (!title || !img || !href) continue;
    const colekaId = attrs.match(/\bdata-id="(\d+)"/i)?.[1] ?? "";
    const pagePath = href.startsWith("http") ? new URL(href).pathname : href;
    const thumbUrl = img[1]!;
    byNumber.set(number, {
      number,
      cardType: number[0] as ColekaStorm3Card["cardType"],
      colekaRef,
      name: decodeEntities(title[1]!),
      colekaId,
      pagePath,
      thumbUrl,
      faceUrl: colekaFullFaceUrl(thumbUrl),
    });
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
}

/** Same listing shape as Storm 3, but allows `CL-` and `MI-US` deck refs. */
export function parseColekaRampageTornadoListing(
  html: string,
): ColekaStorm3Card[] {
  const byNumber = new Map<string, ColekaStorm3Card>();
  for (const match of html.matchAll(ITEM_RE)) {
    const attrs = match[1]!;
    const inner = match[2]!;
    const ref = inner.match(
      /<span class="ref">\s*Ref\.\s*((?:NI|JU|MI)-US\d{2,4}|(?:NI|JU|MI)-\d{2,4}|CL-\d{2,4})\s*<\/span>/i,
    );
    if (!ref) continue;
    const colekaRef = ref[1]!.toUpperCase();
    const number = colekaRampagePrefixToCollector(colekaRef);
    if (!number || byNumber.has(number)) continue;
    const cardType = cardTypeOfNumber(number);
    if (!cardType) continue;
    const title = inner.match(/<h3 class="product-title">([^<]+)<\/h3>/i);
    const img = inner.match(
      /<img[^>]+src="(https:\/\/thumbs\.coleka\.com\/media\/item\/[^"]+)"/i,
    );
    const href = attrs.match(/\bhref="([^"]+)"/i)?.[1];
    if (!title || !img || !href) continue;
    const colekaId = attrs.match(/\bdata-id="(\d+)"/i)?.[1] ?? "";
    const pagePath = href.startsWith("http") ? new URL(href).pathname : href;
    const thumbUrl = img[1]!;
    byNumber.set(number, {
      number,
      cardType,
      colekaRef,
      name: decodeEntities(title[1]!),
      colekaId,
      pagePath,
      thumbUrl,
      faceUrl: colekaFullFaceUrl(thumbUrl),
    });
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
}
