/**
 * Coleka FR scans for Bandai USA CCG Series 28 (Ultimate Ninja Storm 3).
 *
 * Coleka files this set as « Cartes Naruto Série 28 » (`_r16649`) and prints
 * EU prefixes `NI-` / `JU-` / `MI-`. Those are the same cards as EN `N/J/M`
 * (and the same collector family as Carddass `NI/TE/TA`). Disk ids stay
 * `n1650` / `j1002` / `m976` so files land in the EN pack, not `ni1650`.
 *
 * Do not scrape the parent umbrella `_r4102` (~7000 mixed cards). The
 * rubrique webp is the Series 28 display packshot (box + booster), not a
 * card listing.
 */
import { STORM3_SET } from "./parseStorm3Shop";

export { STORM3_SET };

export const COLEKA_STORM3_LANG = "fr";
export const COLEKA_ORIGIN = "https://www.coleka.com";
export const COLEKA_STORM3_LISTING_PATH =
  "/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner/cartes-naruto-serie-28_r16649";
/** Display packshot Coleka uses for Série 28 (box + booster). */
export const COLEKA_STORM3_SET_COVER_URL =
  "https://thumbs.coleka.com/media/rubrique/202012/05/cartes-de-collection-cartes-anime-manga-naruto-cartes-a-jouer-et-a-collectionner-carte-naruto-serie-28.webp";

export type ColekaStorm3Card = {
  /** Disk / print id: `n1650`, never `ni1650`. */
  number: string;
  cardType: "n" | "j" | "m";
  /** Printed Coleka ref: `NI-1650`. */
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

/** Listing thumbs are `_250x250.webp`; the full face is the same path without the size suffix. */
export function colekaFullFaceUrl(thumbUrl: string): string {
  return thumbUrl.replace(/_\d+x\d+(?=\.(?:webp|jpe?g|png|gif)(?:\?|$))/i, "");
}

export function colekaHtmlIsVerifyWall(html: string): boolean {
  if (/<title>\s*Vérification/i.test(html)) return true;
  return (
    /\/verify\/\?lang=/i.test(html) &&
    !/class="[^"]*lib_has_2_lines/i.test(html)
  );
}

/**
 * Coleka paginates 48-per-page (`?p=1` is page 2). Page 1 is often a Cloudflare
 * cache HIT; later pages tend to trip the verify wall. `nbpp=240` is uncached.
 */
export function colekaStorm3ListingPageUrls(): string[] {
  const base = `${COLEKA_ORIGIN}${COLEKA_STORM3_LISTING_PATH}`;
  return [base, `${base}?p=1`, `${base}?p=2`];
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
