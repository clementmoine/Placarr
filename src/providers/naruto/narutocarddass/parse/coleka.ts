/**
 * Naruto Carddass coleka parsers.
 */

import coleka from "../curated/sources/coleka.json";
import ledger from "../curated/sources/coleka-s6-it.json";
import { STORM3_SET } from "./marketplace";
import { narutoDiskCardId } from "../identity";
import colekaUsPromos from "../curated/sources/coleka-us-promos.json";

// ─── shared helpers ─────────────────────────────────────────────────────

const NO_IMAGE_RE = /\/css\/assets\/default\/no-image/i;

const ITEM_RE =
  /<a\s([^>]*class="[^"]*lib_has_2_lines[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;

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

// ─── parseColekaCarddassFr ──────────────────────────────────────────────────────────

/**
 * Coleka listings for French Carddass S1–S5 (leaves under `_r41705`).
 *
 * Parent `_r41705` (~741) and umbrella `_r4102` stay unscraped. Faces come
 * from `thumbs.coleka.com`. Coleka names a series after one starter — that
 * is a collector label, not Bandai's. Disk ids stay `ni/te/ta/cl` in
 * `cards/{family}/{ni0001}/fr/`. Do not write these into `cards/s6/`.
 */
export const COLEKA_CARDDASS_FR_LANG = "fr";

export type ColekaCarddassFrSeriesCode = "s1" | "s2" | "s3" | "s4" | "s5";

export type ColekaCarddassFrSeries = {
  set: ColekaCarddassFrSeriesCode;
  rubrique: string;
  path: string;
  listedCount: number;
};

export type ColekaCarddassFrCard = {
  number: string;
  cardType: ColekaS6ItCardType;
  set: ColekaCarddassFrSeriesCode;
  colekaRef: string;
  name: string | null;
  colekaId: string;
  pagePath: string;
  thumbUrl: string | null;
  faceUrl: string | null;
};

const SERIES_PATH: Record<ColekaCarddassFrSeriesCode, string> = {
  s1: new URL(coleka.branches["serie-01"]).pathname,
  s2: "/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/naruto-carddass-series-francaises/cartes-naruto-serie-02-detruire-konoha_r4109",
  s3: "/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/naruto-carddass-series-francaises/cartes-naruto-serie-03-puissances-cachees_r4110",
  s4: "/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/naruto-carddass-series-francaises/cartes-naruto-serie-04-l-esprit-du-sable_r4111",
  s5: "/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/naruto-carddass-series-francaises/cartes-naruto-serie-05-un-nouveau-depart_r4112",
};

/** Coleka leaf counts (2026-08-17). Parent `_r41705` lists 741. */
const SERIES_COUNTS: Record<ColekaCarddassFrSeriesCode, number> = {
  s1: 184,
  s2: 156,
  s3: 128,
  s4: 126,
  s5: 147,
};

export const COLEKA_CARDDASS_FR_SERIES: readonly ColekaCarddassFrSeries[] = (
  ["s1", "s2", "s3", "s4", "s5"] as const
).map((set) => ({
  set,
  rubrique: `_r${{ s1: "4108", s2: "4109", s3: "4110", s4: "4111", s5: "4112" }[set]}`,
  path: SERIES_PATH[set],
  listedCount: SERIES_COUNTS[set],
}));

export function colekaCarddassFrParentUrl(): string {
  return coleka.branches["series-francaises"];
}

/** 48 per page; `?p=1` is page 2. Extra pages stop at empty / verify wall. */
export function colekaCarddassFrListingPageUrls(
  path: string,
  listedCount: number,
): string[] {
  const base = `${COLEKA_ORIGIN}${path}`;
  const pages = Math.max(1, Math.ceil(listedCount / 48));
  return [
    base,
    ...Array.from({ length: pages - 1 }, (_, i) => `${base}?p=${i + 1}`),
  ];
}

export function parseColekaCarddassFrListing(
  html: string,
  set: ColekaCarddassFrSeriesCode,
): ColekaCarddassFrCard[] {
  const byNumber = new Map<string, ColekaCarddassFrCard>();
  for (const match of html.matchAll(ITEM_RE)) {
    const attrs = match[1]!;
    const inner = match[2]!;
    const ref = inner.match(
      /<span class="ref">\s*Ref\.\s*(NI|TE|TA|CL)-(\d{1,3})\s*<\/span>/i,
    );
    if (!ref) continue;
    const colekaRef = `${ref[1]!.toUpperCase()}-${ref[2]}`;
    const number = colekaCarddassPrefixToCollector(colekaRef);
    if (!number || byNumber.has(number)) continue;
    const title = inner.match(/<h3 class="product-title">([^<]+)<\/h3>/i);
    const rawName = title ? decodeEntities(title[1]!) : "";
    const name =
      rawName && !colekaS6ItNameIsPlaceholder(rawName) ? rawName : null;
    const img = inner.match(
      /<img[^>]+src="(https:\/\/thumbs\.coleka\.com\/[^"]+)"/i,
    );
    const href = attrs.match(/\bhref="([^"]+)"/i)?.[1];
    if (!href) continue;
    const colekaId = attrs.match(/\bdata-id="(\d+)"/i)?.[1] ?? "";
    const pagePath = href.startsWith("http") ? new URL(href).pathname : href;
    const thumbUrl = img?.[1] ?? null;
    const hasFace = Boolean(thumbUrl) && !NO_IMAGE_RE.test(thumbUrl!);
    byNumber.set(number, {
      number,
      cardType: number.slice(0, 2) as ColekaS6ItCardType,
      set,
      colekaRef,
      name,
      colekaId,
      pagePath,
      thumbUrl: hasFace ? thumbUrl : null,
      faceUrl: hasFace ? colekaFullFaceUrl(thumbUrl!) : null,
    });
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
}

// ─── parseColekaS6It ──────────────────────────────────────────────────────────

/**
 * Coleka listing for CACG Series 6 printed in Italy (Rivalità Eterna).
 *
 * Branch `_r41388` sits outside the French Carddass rubrique. Coleka prints
 * `NI/TE/TA/CL`; the physical tactique prefix is `ST`. Disk ids stay
 * `ni/te/ta/cl` (`ta226`, never `st226`) so FR and IT share a collector
 * number. Locale is `it`. Do not scrape the parent umbrella `_r4102`.
 */
export const COLEKA_S6_IT_SET = "s6";
export const COLEKA_S6_IT_LANG = "it";
export const COLEKA_S6_IT_LISTING_PATH = ledger.listing.path;

export type ColekaS6ItCardType = "ni" | "te" | "ta" | "cl";

export type ColekaS6ItCard = {
  number: string;
  cardType: ColekaS6ItCardType;
  /** Coleka listing ref (`TA-226`). */
  colekaRef: string;
  /** What the Italian card prints (`ST-226` for tactique). */
  printedRef: string;
  /** Null when Coleka only has « Carte NI-255 ». */
  name: string | null;
  colekaId: string;
  pagePath: string;
  thumbUrl: string | null;
  faceUrl: string | null;
};

const s6It_PREFIX_TO_TYPE: Record<string, ColekaS6ItCardType> = {
  ni: "ni",
  te: "te",
  ta: "ta",
  st: "ta",
  cl: "cl",
};

/** `TA-226` / `ST-226` / `CL-32` → `ta226` / `cl032`. Null for EN CCG leaks. */
export function colekaCarddassPrefixToCollector(raw: string): string | null {
  const m = /^(NI|TE|TA|ST|CL)[\s-]*(\d{1,3})$/i.exec(raw.trim());
  if (!m) return null;
  const type = s6It_PREFIX_TO_TYPE[m[1]!.toLowerCase()];
  if (!type) return null;
  return `${type}${String(Number(m[2])).padStart(3, "0")}`;
}

export function colekaS6ItPrintedRef(colekaRef: string): string {
  const m = /^(NI|TE|TA|ST|CL)[\s-]*(\d{1,3})$/i.exec(colekaRef.trim());
  if (!m) return colekaRef;
  const prefix = m[1]!.toUpperCase() === "TA" ? "ST" : m[1]!.toUpperCase();
  return `${prefix}-${m[2]}`;
}

/** Coleka fallback when the Italian name was never typed in. */
export function colekaS6ItNameIsPlaceholder(name: string): boolean {
  return /^carte\s+(ni|te|ta|st|cl)[-\s]?\d+/i.test(name.trim());
}

export function colekaS6ItListingPageUrls(): string[] {
  const base = `${COLEKA_ORIGIN}${COLEKA_S6_IT_LISTING_PATH}`;
  return [base, `${base}?p=1`, `${base}?p=2`];
}

export function parseColekaS6ItListing(html: string): ColekaS6ItCard[] {
  const byNumber = new Map<string, ColekaS6ItCard>();
  for (const match of html.matchAll(ITEM_RE)) {
    const attrs = match[1]!;
    const inner = match[2]!;
    const ref = inner.match(
      /<span class="ref">\s*Ref\.\s*(NI|TE|TA|ST|CL)-(\d{1,3})\s*<\/span>/i,
    );
    if (!ref) continue;
    const colekaRef = `${ref[1]!.toUpperCase()}-${ref[2]}`;
    const number = colekaCarddassPrefixToCollector(colekaRef);
    if (!number || byNumber.has(number)) continue;
    const title = inner.match(/<h3 class="product-title">([^<]+)<\/h3>/i);
    const rawName = title ? decodeEntities(title[1]!) : "";
    const name =
      rawName && !colekaS6ItNameIsPlaceholder(rawName) ? rawName : null;
    const img = inner.match(
      /<img[^>]+src="(https:\/\/thumbs\.coleka\.com\/[^"]+)"/i,
    );
    const href = attrs.match(/\bhref="([^"]+)"/i)?.[1];
    if (!href) continue;
    const colekaId = attrs.match(/\bdata-id="(\d+)"/i)?.[1] ?? "";
    const pagePath = href.startsWith("http") ? new URL(href).pathname : href;
    const thumbUrl = img?.[1] ?? null;
    const hasFace = Boolean(thumbUrl) && !NO_IMAGE_RE.test(thumbUrl!);
    byNumber.set(number, {
      number,
      cardType: number.slice(0, 2) as ColekaS6ItCardType,
      colekaRef,
      printedRef: colekaS6ItPrintedRef(colekaRef),
      name,
      colekaId,
      pagePath,
      thumbUrl: hasFace ? thumbUrl : null,
      faceUrl: hasFace ? colekaFullFaceUrl(thumbUrl!) : null,
    });
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
}

// ─── parseColekaStorm3 ──────────────────────────────────────────────────────────

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
/** Checklist / appearances id — not EN Approaching Wind (`s11`). */
export const RAMPAGE_TORNADO_SET = "tempete";
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

const colekaStorm3_PREFIX_TO_TYPE = {
  ni: "n",
  ju: "j",
  mi: "m",
} as const;

/**
 * `NI-1650` / `JU-1002` / `MI-976` → `n1650` / `j1002` / `m976`.
 * Short deals forms `Ni 1579` / `J 986` need a separator (space/hyphen) so
 * disk ids like `n1650` stay rejected.
 * Returns null for Carddass `TE`/`TA`/`CL` so a grab-bag listing cannot leak.
 */
export function colekaEuPrefixToCollector(raw: string): string | null {
  const trimmed = raw.trim();
  const long = /^(NI|JU|MI)[\s-]*(\d{3,4})$/i.exec(trimmed);
  if (long) {
    const letter =
      colekaStorm3_PREFIX_TO_TYPE[
        long[1]!.toLowerCase() as keyof typeof colekaStorm3_PREFIX_TO_TYPE
      ];
    return `${letter}${long[2]}`;
  }
  const short = /^(N|J|M)[\s-]+(\d{3,4})$/i.exec(trimmed);
  if (!short) return null;
  const letter = short[1]!.toLowerCase() as "n" | "j" | "m";
  return `${letter}${short[2]}`;
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
      colekaStorm3_PREFIX_TO_TYPE[us[1]!.toLowerCase() as keyof typeof colekaStorm3_PREFIX_TO_TYPE];
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

export { colekaHtmlIsVerifyWall } from "@/providers/shared/coleka/verifyWall";

/** Listing thumbs are `_250x250.webp`; the full face is the same path without the size suffix. */
export function colekaFullFaceUrl(thumbUrl: string): string {
  return thumbUrl.replace(/_\d+x\d+(?=\.(?:webp|jpe?g|png|gif)(?:\?|$))/i, "");
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

// ─── parseColekaUsPromos ──────────────────────────────────────────────────────────

/**
 * Coleka `_r38199` Bandai USA CCG promotional cards (English text).
 *
 * Coleka writes `Pr 001` / `Pr 005R`. Disk stays `pr0001` / `pr0005-R` so the
 * foil reprint is not the untagged promo. Do not scrape the parent umbrella
 * `_r4102` (~7000 mixed cards). EN CCG `PR-011` Successors is not the French
 * tin `pr011` Orochimaru — same disk folder, locale split (`en` vs `fr`).
 */
export const COLEKA_US_PROMO_SET = "promo";
export const COLEKA_US_PROMO_LANG = "en";
export const COLEKA_US_PROMO_LISTING_PATH = colekaUsPromos.listing.path;

export type ColekaUsPromoCard = {
  /** Disk id: `pr0001` / `pr0005-R`. */
  number: string;
  cardType: "pr";
  /** Canonical printed ref: `PR-001` / `PR-005R`. */
  colekaRef: string;
  name: string;
  colekaId: string;
  pagePath: string;
  thumbUrl: string;
  faceUrl: string;
};

/**
 * `Pr 001` / `PR-096` / `Pr 005R` → `pr0001` / `pr0096` / `pr0005-R`.
 * Null for Carddass / EU CCG leaks (`NI-1650`, `JU-1002`).
 */
export function colekaUsPromoRefToCollector(raw: string): string | null {
  const m = /^Pr[\s-]*(\d{1,4})(R)?$/i.exec(raw.trim());
  if (!m) return null;
  const printed = m[2] ? `PR-${m[1]}R` : `PR-${m[1]}`;
  return narutoDiskCardId(printed);
}

export function colekaUsPromoCanonicalRef(raw: string): string | null {
  const m = /^Pr[\s-]*(\d{1,4})(R)?$/i.exec(raw.trim());
  if (!m) return null;
  const digits = m[1]!.padStart(3, "0");
  return m[2] ? `PR-${digits}R` : `PR-${digits}`;
}

/** 101 cards; Coleka paginates 48-per-page (`?p=1` is page 2). */
export function colekaUsPromoListingPageUrls(): string[] {
  const base = `${COLEKA_ORIGIN}${COLEKA_US_PROMO_LISTING_PATH}`;
  return [base, `${base}?p=1`, `${base}?p=2`];
}

export function parseColekaUsPromoListing(html: string): ColekaUsPromoCard[] {
  const byNumber = new Map<string, ColekaUsPromoCard>();
  for (const match of html.matchAll(ITEM_RE)) {
    const attrs = match[1]!;
    const inner = match[2]!;
    const ref = inner.match(
      /<span class="ref">\s*Ref\.\s*(Pr[\s-]*\d{1,4}R?)\s*<\/span>/i,
    );
    if (!ref) continue;
    const number = colekaUsPromoRefToCollector(ref[1]!);
    const colekaRef = colekaUsPromoCanonicalRef(ref[1]!);
    if (!number || !colekaRef || byNumber.has(number)) continue;
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
      cardType: "pr",
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
