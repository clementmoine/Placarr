/**
 * Coleka `_r37171` — Bleach Serie 1 FR (2008, 69 + 2 promos).
 *
 * Refs `Ref. A 001` / `C 016` / `E 007` / `P 001` / `Z 002` → printKeys FR
 * (`A001`…), jamais JP Ability `A-###`. Hors périmètre : Score Bleach TCG.
 */
import { parseBleachScbPrinted } from "../printKey";

export const COLEKA_BLEACH_ORIGIN = "https://www.coleka.com";
export const COLEKA_BLEACH_S1_LISTING_PATH =
  "/fr/cartes-de-collection/cartes-anime-manga/bleach-serie-1_r37171";
export const COLEKA_BLEACH_S1_LISTED_COUNT = 71;
export const COLEKA_BLEACH_SOURCE_ID = "coleka";

export type ColekaBleachCard = {
  printed: string;
  set: string;
  number: string;
  nameFr: string;
  thumbUrl: string;
  faceUrl: string;
  pageUrl: string;
  colekaId: string;
};

export type ColekaBleachParse = {
  cards: ColekaBleachCard[];
  rejected: { name: string; reason: string }[];
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
    .replace(/&ocirc;/gi, "ô")
    .replace(/&ucirc;/gi, "û")
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/\s+/g, " ")
    .trim();
}

/** Thumb `_250x250.webp` → full CDN face. */
export function colekaBleachFaceUrl(thumbUrl: string): string {
  return thumbUrl.replace(
    /_\d+x\d+(?=\.(?:webp|jpe?g|png|gif)(?:\?|$))/i,
    "",
  );
}

/** Page 1 = path ; `?p=1` = page 2 (48/page). */
export function colekaBleachS1ListingPageUrls(): string[] {
  const base = `${COLEKA_BLEACH_ORIGIN}${COLEKA_BLEACH_S1_LISTING_PATH}`;
  const pages = Math.max(
    1,
    Math.ceil(COLEKA_BLEACH_S1_LISTED_COUNT / 48),
  );
  return [
    base,
    ...Array.from({ length: pages - 1 }, (_, i) => `${base}?p=${i + 1}`),
  ];
}

const SKIP_TITLE =
  /^(album|pochette|bo[iî]te|display|starter|lot\b)/i;

/**
 * Parse one Coleka rubrique listing HTML for Bleach S1 FR.
 * Identity = `Ref. [ACEZP] NNN` only — no invented numbers from filenames.
 */
export function parseColekaBleachListing(html: string): ColekaBleachParse {
  const cards: ColekaBleachCard[] = [];
  const rejected: ColekaBleachParse["rejected"] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(
    /<li class="[^"]*\bcol-md-4\b[^"]*"[\s\S]*?<\/li>/gi,
  )) {
    const block = m[0] ?? "";
    const titleMatch = block.match(/<h3 class="product-title">([^<]+)<\/h3>/i);
    const imgMatch = block.match(
      /src="(https:\/\/thumbs\.coleka\.com\/media\/item\/[^"]+)"/i,
    );
    const hrefMatch = block.match(/href="([^"]+_i(\d+))"/i);
    const refMatch = block.match(/Ref\.\s*([ACEZP])\s*(\d{1,3})\b/i);
    if (!titleMatch || !imgMatch || !refMatch) {
      const name = titleMatch ? decodeEntities(titleMatch[1] ?? "") : "";
      if (name) rejected.push({ name, reason: "no-ref-or-thumb" });
      continue;
    }

    const name = decodeEntities(titleMatch[1] ?? "");
    const thumbUrl = imgMatch[1] ?? "";
    if (!name || !thumbUrl) continue;
    if (SKIP_TITLE.test(name)) {
      rejected.push({ name, reason: "non-card" });
      continue;
    }

    const printedRaw = `${refMatch[1]!.toUpperCase()}${refMatch[2]}`;
    const parsed = parseBleachScbPrinted(printedRaw);
    if (!parsed || !/^[acezp]$/.test(parsed.set)) {
      rejected.push({ name, reason: "bad-ref" });
      continue;
    }
    if (seen.has(parsed.printed)) continue;
    seen.add(parsed.printed);

    const href = hrefMatch?.[1] ?? "";
    const colekaId = hrefMatch?.[2] ?? "";
    const pageUrl = href
      ? href.startsWith("http")
        ? href
        : `${COLEKA_BLEACH_ORIGIN}${href}`
      : `${COLEKA_BLEACH_ORIGIN}${COLEKA_BLEACH_S1_LISTING_PATH}`;

    cards.push({
      printed: parsed.printed,
      set: parsed.set,
      number: parsed.number,
      nameFr: name,
      thumbUrl,
      faceUrl: colekaBleachFaceUrl(thumbUrl),
      pageUrl,
      colekaId,
    });
  }

  cards.sort((a, b) => a.printed.localeCompare(b.printed));
  return { cards, rejected };
}
