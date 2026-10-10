import { isAbortError } from "@/lib/http/abort";
import { httpGet } from "@/lib/http/httpClient";

import {
  fullSetSearchEvidenceUrl,
  promoteFullSetSearchEvidence,
  readFullSetSearchEvidence,
} from "./durableEvidence";

const BASE_URL = "https://full-set.net";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9",
  Referer: `${BASE_URL}/`,
};

export interface FullSetSearchHit {
  url: string;
  title: string;
  /** Category label from the search card ("Jeux", "Consoles", …). */
  category?: string;
  /** Platform display label from the search card ("Playstation", …). */
  platformLabel?: string;
  year?: string;
  /** Console segment of the item URL (`psx`, `ps2_pal`, `atari2600`, …). */
  consoleSlug?: string;
}

export interface FullSetItem {
  title: string;
  productUrl: string;
  consoleLabel?: string;
  supportLabel?: string;
  genre?: string;
  releaseYear?: string;
  developer?: string;
  publisher?: string;
  /** Full Set rarity index, 0 (common) to 100 (rare). */
  rarityScore?: number;
  /** Indicative median market price as displayed ("15,00 €"). */
  medianPrice?: string;
  /** Number of marketplace listings behind the median price. */
  listingCount?: number;
}

function decodeFullSetHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const cleaned = decodeFullSetHtmlEntities(value).replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

export function fullSetConsoleSlugFromUrl(url: string): string | undefined {
  return url.match(/(?:^|\/)([^/]+)\/item\/[^/]+\.html/i)?.[1]?.toLowerCase();
}

export function parseFullSetSearchHtml(
  html: string,
  limit = 8,
): FullSetSearchHit[] {
  const hits: FullSetSearchHit[] = [];
  // The markup puts attributes on their own lines (<a\n\thref="…"\n\tclass="…").
  const cardPattern =
    /<a\s+[^>]*href="(\/[^"]+\/item\/[^"]+\.html)"[^>]*>[\s\S]*?<\/a>/g;

  for (const match of html.matchAll(cardPattern)) {
    const [card, path] = match;
    if (!card.includes("fs-search-card")) continue;
    const meta = cleanText(
      card
        .match(/fs-search-card__meta"[^>]*>([\s\S]*?)<\/span>\s*<strong>/)?.[1]
        ?.replace(/<[^>]+>/g, " "),
    );
    const [category, year] = (meta ?? "").split("•").map((part) => part.trim());
    const title = cleanText(card.match(/<strong>([\s\S]*?)<\/strong>/)?.[1]);
    const platformLabel = cleanText(
      card.match(/fs-search-card__support"[^>]*>([\s\S]*?)<\/span>/)?.[1],
    );
    if (!title) continue;

    hits.push({
      url: `${BASE_URL}${path}`,
      title,
      category: category || undefined,
      platformLabel,
      year: year || undefined,
      consoleSlug: fullSetConsoleSlugFromUrl(path),
    });
    if (hits.length >= limit) break;
  }

  return hits;
}

const ITEM_FACT_LABELS = {
  console: /^console$/i,
  support: /^support$/i,
  genre: /^genre$/i,
  releaseYear: /^sortie$/i,
  developer: /^d[ée]veloppeur$/i,
  publisher: /^[ée]diteur$/i,
} as const;

export function parseFullSetItemHtml(
  html: string,
  productUrl: string,
): FullSetItem | null {
  const title = cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]);
  if (!title) return null;

  const item: FullSetItem = { title, productUrl };

  const factPattern =
    /fs-item-qw__fact-copy"[^>]*>\s*<small>([\s\S]*?)<\/small>\s*<strong>([\s\S]*?)<\/strong>/g;
  for (const match of html.matchAll(factPattern)) {
    const label = cleanText(match[1]);
    const value = cleanText(match[2]);
    if (!label || !value) continue;
    if (ITEM_FACT_LABELS.console.test(label)) item.consoleLabel = value;
    else if (ITEM_FACT_LABELS.support.test(label)) item.supportLabel = value;
    else if (ITEM_FACT_LABELS.genre.test(label)) item.genre = value;
    else if (ITEM_FACT_LABELS.releaseYear.test(label)) {
      item.releaseYear = value.match(/\d{4}/)?.[0] ?? value;
    } else if (ITEM_FACT_LABELS.developer.test(label)) item.developer = value;
    else if (ITEM_FACT_LABELS.publisher.test(label)) item.publisher = value;
  }

  const rarity = html.match(/--fs-rarity:\s*(\d{1,3})/)?.[1];
  if (rarity != null) {
    const score = Number(rarity);
    if (Number.isFinite(score) && score >= 0 && score <= 100) {
      item.rarityScore = score;
    }
  }

  const headline = html.match(
    /fs-market__headline-price"[\s\S]{0,600}?<\/div>\s*<strong>([\s\S]*?)<\/strong>/,
  );
  const medianPrice = cleanText(headline?.[1]);
  if (medianPrice && /\d/.test(medianPrice)) item.medianPrice = medianPrice;

  const listingCount = html.match(/(\d+)\s*annonces?\s+d[ée]tect[ée]es?/i)?.[1];
  if (listingCount != null) item.listingCount = Number(listingCount);

  return item;
}

export async function searchFullSet(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<FullSetSearchHit[]> {
  const cleaned = query.trim();
  if (!cleaned) return [];

  const limit = options.limit ?? 8;
  const searchUrl = fullSetSearchEvidenceUrl(cleaned);
  const fromEvidence = await readFullSetSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[FullSet] Search evidence hit for ${searchUrl}`);
    return fromEvidence.slice(0, limit);
  }

  try {
    const response = await httpGet(`${BASE_URL}/recherche.php`, {
      params: { q: cleaned },
      headers: HEADERS,
      timeout: 12_000,
      signal: options.signal,
    });
    const hits = parseFullSetSearchHtml(String(response.data), limit);
    await promoteFullSetSearchEvidence(searchUrl, hits);
    return hits;
  } catch (error) {
    if (!isAbortError(error)) {
      console.error(
        "[FullSet] Search request failed:",
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  }
}

export async function fetchFullSetItem(
  url: string,
  signal?: AbortSignal,
): Promise<FullSetItem | null> {
  try {
    const response = await httpGet(url, {
      headers: HEADERS,
      timeout: 12_000,
      signal,
    });
    return parseFullSetItemHtml(String(response.data), url);
  } catch (error) {
    if (!isAbortError(error)) {
      console.error(
        "[FullSet] Item request failed:",
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  }
}
