/**
 * Play-In singles (`/fr/carte/…`) for Lorcana — EUR retail stock, matched by
 * printKey (set + collector number), not by EAN.
 */
import { parsePrintKey, type PrintIdentity } from "@/core/identify/printKey";

const BASE_URL = "https://www.play-in.com";
const LORCANA_GAME = "lorcana";
/** Play-In catalogue family id for Disney Lorcana (observed on search URLs). */
export const PLAYIN_LORCANA_FAMILY_ID = "18";

export type PlayInCardHit = {
  url: string;
  productId: string;
  title?: string;
};

export type PlayInCardOffer = {
  condition: "new" | "foil";
  priceCents: number;
  label: string;
};

export type PlayInCardPage = {
  title: string | null;
  productUrl: string;
  /** Collector number printed on the primary listing (`N° de carte`). */
  cardNumber: string | null;
  /** Placarr set segment when resolvable (`1`, `13`, …). */
  setCode: string | null;
  /** Play-In image set slug (`tfc`, `aov`, …) when present. */
  imageSetSlug: string | null;
  setLabel: string | null;
  offers: PlayInCardOffer[];
};

/**
 * Play-In media paths use letter codes (`lor_tfc/1.png`). LorcanaJSON / printKey
 * use numeric set ids. Keep the map local to this retailer — it is an
 * observation of their CDN, not a game-wide registry.
 */
const PLAYIN_SET_SLUG_TO_CODE: Record<string, string> = {
  tfc: "1",
  rof: "2",
  iti: "3",
  ur: "4",
  urs: "4",
  ssk: "5",
  azu: "6",
  afi: "7",
  // Observed on « Invasion Épineuse ! Chapitre 13 » (Belle 132).
  aov: "13",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function playInCardSearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query.trim(),
    type: "card",
    searchType: "CARDS",
    family: PLAYIN_LORCANA_FAMILY_ID,
  });
  return `${BASE_URL}/fr/recherche?${params}`;
}

export function parsePlayInEuroCents(raw: string): number | null {
  const cleaned = raw
    .replace(/\u202f/g, "")
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace("€", "")
    .replace(",", ".");
  const amount = Number.parseFloat(cleaned);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export function resolvePlayInSetCode(input: {
  imageSetSlug?: string | null;
  setLabel?: string | null;
}): string | null {
  const slug = input.imageSetSlug?.trim().toLowerCase();
  if (slug && PLAYIN_SET_SLUG_TO_CODE[slug]) {
    return PLAYIN_SET_SLUG_TO_CODE[slug];
  }

  const label = input.setLabel?.trim() ?? "";
  if (!label) return null;
  if (/premier\s+chapitre/i.test(label)) return "1";
  const chapter = label.match(/chapitre\s+(\d+)/i);
  if (chapter?.[1]) return chapter[1];
  return null;
}

export function parsePlayInCardHits(html: string, limit = 8): PlayInCardHit[] {
  const seen = new Set<string>();
  const hits: PlayInCardHit[] = [];

  const push = (rawPath: string, title?: string): boolean => {
    const path = decodeEntities(rawPath.trim());
    const match = path.match(/\/(?:fr|en)\/carte\/(\d+)\/([^/?#]+)/i);
    if (!match) return false;
    const productId = match[1];
    if (seen.has(productId)) return false;
    seen.add(productId);
    hits.push({
      url: `${BASE_URL}/fr/carte/${productId}/${match[2]}`,
      productId,
      title: title?.trim() || undefined,
    });
    return hits.length >= limit;
  };

  for (const match of html.matchAll(
    /href="(\/(?:fr|en)\/carte\/\d+\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const title = decodeEntities(match[2].replace(/<[^>]+>/g, " ")).replace(
      /\s+/g,
      " ",
    );
    if (push(match[1], title)) return hits;
  }

  for (const match of html.matchAll(
    /\\?"url\\?":\\?"(\/(?:fr|en)\/carte\/\d+\/[^"\\]+)\\?"/g,
  )) {
    if (push(match[1])) return hits;
  }

  for (const match of html.matchAll(
    /href="(\/(?:fr|en)\/carte\/\d+\/[^"?#]+)"/gi,
  )) {
    if (push(match[1])) return hits;
  }

  return hits;
}

function extractImageSetAndNumber(html: string): {
  imageSetSlug: string | null;
  imageCardNumber: string | null;
} {
  const match = html.match(
    /media\.play-in\.com\/images\/cartes\/lor_([a-z0-9]+)\/([a-z0-9]+)\.(?:png|jpg|jpeg|webp)/i,
  );
  if (!match) return { imageSetSlug: null, imageCardNumber: null };
  return {
    imageSetSlug: match[1].toLowerCase(),
    imageCardNumber: match[2].toLowerCase(),
  };
}

function extractCardNumber(html: string): string | null {
  const text = decodeEntities(html.replace(/<[^>]+>/g, " "));
  const labeled = text.match(/N[°º]\s*de\s*carte\s+(\d+[a-z]?)/i);
  if (labeled?.[1]) return labeled[1].toLowerCase();
  return null;
}

function extractSetLabel(html: string): string | null {
  const text = decodeEntities(html.replace(/<[^>]+>/g, " "));
  const chapter = text.match(
    /((?:Premier\s+Chapitre)|(?:[^.\n]{0,40}Chapitre\s+\d+[^.\n]{0,20}))/i,
  );
  return chapter?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function extractTitle(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) {
    const title = decodeEntities(h1[1].replace(/<[^>]+>/g, " ")).replace(
      /\s+/g,
      " ",
    );
    if (title) return title.trim();
  }
  const og = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  );
  return og?.[1]?.trim() || null;
}

/**
 * Pull Mint/Nmint + FOIL EUR rows. Skip Iconique / enchanted blocks unless the
 * collector number on the page is itself the enchanted print.
 */
export function parsePlayInCardOffersFromText(text: string): PlayInCardOffer[] {
  const normalized = text.replace(/\u202f|\u00a0/g, " ").replace(/\s+/g, " ");
  const offers: PlayInCardOffer[] = [];
  let newCents: number | null = null;
  let foilCents: number | null = null;

  // Walk Mint/Nmint blocks left-to-right. Iconique enchanted listings sit in
  // their own block and must not overwrite the base print's foil.
  for (const block of normalized.matchAll(
    /Mint\s*\/\s*Nmint(.*?)(?=Mint\s*\/\s*Nmint|$)/gi,
  )) {
    const chunk = block[1] ?? "";
    if (/Iconique/i.test(chunk)) continue;
    const priceMatch = chunk.match(/(\d[\d\s]*(?:,\d{2})?)\s*€/);
    if (!priceMatch) continue;
    const cents = parsePlayInEuroCents(priceMatch[1] ?? "");
    if (cents == null) continue;
    if (/FOIL/i.test(chunk)) {
      if (foilCents == null) foilCents = cents;
    } else if (newCents == null) {
      newCents = cents;
    }
  }

  if (newCents != null) {
    offers.push({
      condition: "new",
      priceCents: newCents,
      label: "Mint/Nmint",
    });
  }
  if (foilCents != null) {
    offers.push({
      condition: "foil",
      priceCents: foilCents,
      label: "Mint/Nmint FOIL",
    });
  }
  return offers;
}

export function parsePlayInCardPageHtml(
  html: string,
  url: string,
): PlayInCardPage {
  const { imageSetSlug, imageCardNumber } = extractImageSetAndNumber(html);
  const cardNumber = extractCardNumber(html) ?? imageCardNumber;
  const setLabel = extractSetLabel(html);
  const setCode = resolvePlayInSetCode({ imageSetSlug, setLabel });
  const plain = decodeEntities(html.replace(/<[^>]+>/g, " "));

  return {
    title: extractTitle(html),
    productUrl: url,
    cardNumber,
    setCode,
    imageSetSlug,
    setLabel,
    offers: parsePlayInCardOffersFromText(plain),
  };
}

export function playInCardMatchesPrintKey(
  page: PlayInCardPage,
  printKey: string | null | undefined,
): boolean {
  const identity = parsePrintKey(printKey);
  if (!identity || identity.game !== LORCANA_GAME) return false;
  return playInCardMatchesIdentity(page, identity);
}

export function playInCardMatchesIdentity(
  page: PlayInCardPage,
  identity: PrintIdentity,
): boolean {
  if (!page.cardNumber) return false;
  if (page.cardNumber.toLowerCase() !== identity.number.toLowerCase()) {
    return false;
  }
  // When we resolved a set, it must agree. Unknown set + exact collector number
  // is not enough alone for multi-set reprints — require set when available.
  if (page.setCode && page.setCode !== identity.set) return false;
  if (!page.setCode) return false;
  // Promo groupings are a different print; Play-In pages we probed are base
  // set listings without a -pN identity.
  if (identity.grouping) return false;
  return true;
}

export function lorcanaPrintKeyFromContext(
  printKey?: string | null,
): string | null {
  const identity = parsePrintKey(printKey);
  if (!identity || identity.game !== LORCANA_GAME) return null;
  return printKey!.trim();
}
