/**
 * Coleka listing for CACG Series 6 printed in Italy (Rivalità Eterna).
 *
 * Branch `_r41388` sits outside the French Carddass rubrique. Coleka prints
 * `NI/TE/TA/CL`; the physical tactique prefix is `ST`. Disk ids stay
 * `ni/te/ta/cl` (`ta226`, never `st226`) so FR and IT share a collector
 * number. Locale is `it`. Do not scrape the parent umbrella `_r4102`.
 */
import { COLEKA_ORIGIN, colekaFullFaceUrl } from "./parseColekaStorm3";
import ledger from "../curated/sources/coleka-s6-it.json";

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

const PREFIX_TO_TYPE: Record<string, ColekaS6ItCardType> = {
  ni: "ni",
  te: "te",
  ta: "ta",
  st: "ta",
  cl: "cl",
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

/** `TA-226` / `ST-226` / `CL-32` → `ta226` / `cl032`. Null for EN CCG leaks. */
export function colekaCarddassPrefixToCollector(raw: string): string | null {
  const m = /^(NI|TE|TA|ST|CL)[\s-]*(\d{1,3})$/i.exec(raw.trim());
  if (!m) return null;
  const type = PREFIX_TO_TYPE[m[1]!.toLowerCase()];
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

const ITEM_RE =
  /<a\s([^>]*class="[^"]*lib_has_2_lines[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
const NO_IMAGE_RE = /\/css\/assets\/default\/no-image/i;

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
