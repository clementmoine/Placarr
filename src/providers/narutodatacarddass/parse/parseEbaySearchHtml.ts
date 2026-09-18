/**
 * Parse pasted eBay search HTML into Data Carddass face ledger rows.
 *
 * Live search is bot-blocked (403); browser / View Source paste is the path.
 * Only rows with a printed ref + ebayimg id become candidates.
 */
import {
  formatDataCarddassReference,
  parseDataCarddassPrinted,
} from "../printKey";

const PRINTED_RE =
  /\b((?:NFP|NFM|NFC|NXPF|NXP|DNP|DMP|DN|DT|NM|NC|NF|NX)[- ]?\d+[A-Za-z]?)/i;
const ITM_RE = /\/itm\/(\d+)/i;
const IMG_RE = /i\.ebayimg\.com\/images\/g\/([^/"'\s]+)\/s-l\d+/i;

export type EbayPasteFace = {
  printedRef: string;
  lang: "ja";
  title: string;
  listing: string;
  imageId: string;
  url: string;
  staging: string;
  ingest: true;
};

function normalizePrinted(raw: string): string | null {
  const parsed = parseDataCarddassPrinted(raw.replace(/\s+/g, ""));
  if (!parsed) return null;
  // Skip roman SP promos (NXP-SP…) — ambiguous / non-numeric.
  if (!/^\d/.test(parsed.number)) return null;
  return formatDataCarddassReference(parsed.set, parsed.number);
}

/**
 * Best-effort: scan HTML for /itm/N + nearby title + ebayimg g/{id}.
 * Dedupes by printedRef (first wins).
 */
export function parseEbayDataCarddassSearchHtml(
  html: string,
): EbayPasteFace[] {
  const faces: EbayPasteFace[] = [];
  const seenPrinted = new Set<string>();
  const seenListing = new Set<string>();

  // Split roughly on listing anchors.
  const chunks = html.split(/href="https?:\/\/www\.ebay\.[^"]*\/itm\//i);
  for (let i = 1; i < chunks.length; i += 1) {
    const chunk = chunks[i]!;
    const idMatch = /^(\d+)/.exec(chunk);
    if (!idMatch) continue;
    const listingId = idMatch[1]!;
    if (seenListing.has(listingId)) continue;
    seenListing.add(listingId);

    const window = chunk.slice(0, 4000);
    const printedMatch = PRINTED_RE.exec(window);
    if (!printedMatch) continue;
    const printedRef = normalizePrinted(printedMatch[1]!);
    if (!printedRef) continue;
    const key = printedRef.toUpperCase();
    if (seenPrinted.has(key)) continue;

    const imgMatch = IMG_RE.exec(window);
    if (!imgMatch) continue;
    const imageId = imgMatch[1]!;

    // Title: first substantial text-ish blob after the id.
    const titleRaw =
      (window.match(/aria-label="([^"]{8,180})"/i) || [])[1] ||
      (window.match(/>([^<]{8,180})</) || [])[1] ||
      printedRef;
    const title = titleRaw
      .replace(/\s+/g, " ")
      .replace(/La page s'ouvre.*/i, "")
      .trim()
      .slice(0, 120);

    const slug = printedRef.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    seenPrinted.add(key);
    faces.push({
      printedRef: key,
      lang: "ja",
      title,
      listing: `https://www.ebay.fr/itm/${listingId}`,
      imageId,
      url: `https://i.ebayimg.com/images/g/${imageId}/s-l1600.webp`,
      staging: `staging/ebay/${slug}-ja.webp`,
      ingest: true,
    });
  }

  // Also catch JSON-ish / loose pairs when chunk split fails.
  if (faces.length === 0) {
    ITM_RE.lastIndex = 0;
    // no-op fallback kept for API stability
  }

  faces.sort((a, b) => a.printedRef.localeCompare(b.printedRef));
  return faces;
}
