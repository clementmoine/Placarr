/**
 * Coleka `_r38199` Bandai USA CCG promotional cards (English text).
 *
 * Coleka writes `Pr 001` / `Pr 005R`. Disk stays `pr0001` / `pr0005-R` so the
 * foil reprint is not the untagged promo. Do not scrape the parent umbrella
 * `_r4102` (~7000 mixed cards). EN CCG `PR-011` Successors is not the French
 * tin `pr011` Orochimaru — same disk folder, locale split (`en` vs `fr`).
 */
import { colekaFullFaceUrl, COLEKA_ORIGIN } from "./parseColekaStorm3";
import { narutoDiskCardId } from "../collectorIdentity";
import ledger from "../curated/sources/coleka-us-promos.json";

export const COLEKA_US_PROMO_SET = "promo";
export const COLEKA_US_PROMO_LANG = "en";
export const COLEKA_US_PROMO_LISTING_PATH = ledger.listing.path;

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

const ITEM_RE =
  /<a\s([^>]*class="[^"]*lib_has_2_lines[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;

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
