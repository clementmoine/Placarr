/**
 * Listing Coleka Ultra Challenge — scans collectionneur, refs 001–100.
 *
 * Branche EN (comme Ninja Ranks) : FR/IT tombent plus vite sur le mur.
 * Deux signaux : `Ref. NNN` + numéro dans le nom de fichier de la vignette.
 */
export const COLEKA_ULTRA_ORIGIN = "https://www.coleka.com";
export const COLEKA_ULTRA_LISTING_PATH =
  "/en/trading-cards/panini-cards/naruto-ultra-challenge_r18770";
export const COLEKA_ULTRA_LANG = "fr";
export const COLEKA_ULTRA_SOURCE_ID = "coleka";
export const COLEKA_ULTRA_CARD_COUNT = 100;
/** Slug collection dans les noms de fichier Coleka. */
export const COLEKA_ULTRA_SLUG = "naruto-ultra-challenge";

export type ColekaUltraCard = {
  printed: string;
  number: string;
  name: string;
  thumbUrl: string;
  faceUrl: string;
  pageUrl: string;
};

export type ColekaUltraParse = {
  cards: ColekaUltraCard[];
  rejected: { ref: string; name: string; reason: string }[];
};

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

/** `Ref. 001` → `0001` ; hors 1–100 → null. */
export function parseColekaUltraRef(raw: string): {
  printed: string;
  number: string;
} | null {
  const digits = Number.parseInt(raw.trim(), 10);
  if (
    !Number.isFinite(digits) ||
    digits < 1 ||
    digits > COLEKA_ULTRA_CARD_COUNT
  ) {
    return null;
  }
  return {
    printed: String(digits),
    number: String(digits).padStart(4, "0"),
  };
}

/** Le stem porte-t-il le numéro (ex. `carte-n-50-050`, `…-100-100`) ? */
export function colekaUltraThumbCorroborates(
  thumbUrl: string,
  printed: string,
): boolean {
  const stem = (thumbUrl.split("/").pop() ?? "")
    .replace(/_\d+x\d+\.\w+$/i, "")
    .toLowerCase();
  const n = Number.parseInt(printed, 10);
  if (!Number.isFinite(n)) return false;
  const padded3 = String(n).padStart(3, "0");
  if (new RegExp(`(^|[^0-9])${padded3}([^0-9]|$)`).test(stem)) return true;
  return new RegExp(`carte-n-${n}([^0-9]|$)`).test(stem);
}

/**
 * Gabarit Coleka « pas encore photographiée » (436×600) : le slug de la
 * collection apparaît deux fois dans le fichier
 * (`…-panini-naruto-ultra-challenge-100-100`), comme sur Ninja Ranks.
 */
export function colekaUltraThumbIsPlaceholder(thumbUrl: string): boolean {
  const stem = (thumbUrl.split("/").pop() ?? "")
    .replace(/_\d+x\d+\.\w+$/i, "")
    .toLowerCase();
  return stem.split(COLEKA_ULTRA_SLUG).length > 2;
}

/**
 * Titre listing `Carte n°5` aligné sur `Ref. 005` — second signal quand le
 * fichier ne porte que le personnage (`…-sakura.webp`).
 */
export function colekaUltraTitleCorroborates(
  name: string,
  printed: string,
): boolean {
  const n = Number.parseInt(printed, 10);
  if (!Number.isFinite(n)) return false;
  const m = name.trim().match(/^carte\s*n[°ºo]\s*(\d+)\s*$/i);
  return Boolean(m && Number.parseInt(m[1]!, 10) === n);
}

export function colekaUltraFaceUrl(thumbUrl: string): string {
  return thumbUrl.replace(/_\d+x\d+(?=\.(?:webp|jpe?g|png|gif)(?:\?|$))/i, "");
}

export function colekaUltraListingPageUrls(): string[] {
  const base = `${COLEKA_ULTRA_ORIGIN}${COLEKA_ULTRA_LISTING_PATH}`;
  return [base, `${base}?p=1`, `${base}?p=2`];
}

export function parseColekaUltraListing(html: string): ColekaUltraParse {
  const byNumber = new Map<string, ColekaUltraCard>();
  const rejected: ColekaUltraParse["rejected"] = [];

  for (const match of html.matchAll(ITEM_RE)) {
    const attrs = match[1]!;
    const inner = match[2]!;
    const href = attrs.match(/href="([^"]+)"/i)?.[1];
    const refMatch = inner.match(
      /<span class="ref">\s*Ref\.\s*([A-Za-z0-9]{1,4})\s*<\/span>/i,
    );
    if (!refMatch || !href) continue;
    const title = inner.match(/<h3 class="product-title">([^<]+)<\/h3>/i);
    const img = inner.match(
      /<img[^>]+src="(https:\/\/thumbs\.coleka\.com\/media\/item\/[^"]+)"/i,
    );
    if (!title || !img) continue;
    const name = decodeEntities(title[1]!);
    if (/album/i.test(name)) {
      rejected.push({
        ref: refMatch[1]!.trim(),
        name,
        reason: "album — produit scellé, pas une face",
      });
      continue;
    }
    const parsed = parseColekaUltraRef(refMatch[1]!);
    if (!parsed) {
      rejected.push({
        ref: refMatch[1]!.trim(),
        name,
        reason: "référence hors 1–100",
      });
      continue;
    }
    const thumbUrl = img[1]!;
    if (colekaUltraThumbIsPlaceholder(thumbUrl)) {
      rejected.push({
        ref: parsed.printed,
        name,
        reason:
          "gabarit « pas encore photographiée » : le nom de fichier répète le slug de la collection",
      });
      continue;
    }
    const thumbOk = colekaUltraThumbCorroborates(thumbUrl, parsed.printed);
    const titleOk = colekaUltraTitleCorroborates(name, parsed.printed);
    if (!thumbOk && !titleOk) {
      rejected.push({
        ref: parsed.printed,
        name,
        reason:
          "ni le fichier ni le titre « Carte n°N » ne portent la référence",
      });
      continue;
    }
    if (byNumber.has(parsed.number)) continue;
    const pageUrl = href.startsWith("http")
      ? href
      : `${COLEKA_ULTRA_ORIGIN}${href}`;
    byNumber.set(parsed.number, {
      ...parsed,
      name,
      thumbUrl,
      faceUrl: colekaUltraFaceUrl(thumbUrl),
      pageUrl,
    });
  }

  return {
    cards: [...byNumber.values()].sort(
      (a, b) => Number.parseInt(a.number, 10) - Number.parseInt(b.number, 10),
    ),
    rejected,
  };
}
