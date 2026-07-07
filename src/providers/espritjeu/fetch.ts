import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";
import { decode as decodeHTMLEntities } from "html-entities";

import {
  barcodesEquivalent,
  normalizeProductBarcode,
} from "@/core/identify/normalize";

const BASE_URL = "https://www.espritjeu.com";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

export interface EspritJeuSearchHit {
  url: string;
  title?: string;
}

export interface EspritJeuProduct {
  title?: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  barcode?: string;
  priceCents?: number;
  productUrl: string;
  listingTitles?: string[];
}

function stripHtml(value: string): string {
  return decodeHTMLEntities(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function parseMetaContent(html: string, property: string): string | undefined {
  const tagMatch = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`, "i"),
  );
  if (!tagMatch) return undefined;

  const tag = tagMatch[0];
  const doubleQuoted = tag.match(/\bcontent\s*=\s*"([^"]*)"/i);
  if (doubleQuoted) {
    return decodeHTMLEntities(doubleQuoted[1].trim());
  }

  const singleQuoted = tag.match(/\bcontent\s*=\s*'([^']*)'/i);
  if (singleQuoted) {
    return decodeHTMLEntities(singleQuoted[1].trim());
  }

  return undefined;
}

function parseFrenchPrice(html: string): number | undefined {
  const match = html.match(
    /class="bp_prix"[\s\S]{0,400}?([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:&euro;|€)/i,
  );
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(amount)) return undefined;
  return Math.round(amount * 100);
}

function cleanEspritJeuTitle(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return (
    raw
      .replace(/\s*-\s*Jeux de soci[ée]t[ée].*$/i, "")
      .replace(/\s*-\s*Acheter sur Espritjeu\.com.*$/i, "")
      .trim() || undefined
  );
}

export function parseEspritJeuProductImages(html: string): string[] {
  const seen = new Set<string>();
  const images: string[] = [];

  for (const match of html.matchAll(
    /https:\/\/www\.espritjeu\.com\/upload\/image\/[^"'\s]+-grande\.jpg(?:\?[^"'\s]*)?/gi,
  )) {
    const url = match[0];
    if (/offre-|happy-weeks|banner|promo/i.test(url)) continue;
    const key = url.split("?")[0]?.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    images.push(url);
  }

  return images;
}

export function parseEspritJeuSearchHits(
  html: string,
  limit = 8,
): EspritJeuSearchHit[] {
  const seen = new Set<string>();
  const hits: EspritJeuSearchHit[] = [];

  for (const match of html.matchAll(
    /href="(https:\/\/www\.espritjeu\.com\/jeu-de-societe\/[^"]+\.html)"/gi,
  )) {
    const url = match[1];
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const blockStart = Math.max(0, (match.index ?? 0) - 200);
    const blockEnd = Math.min(html.length, (match.index ?? 0) + 1200);
    const block = html.slice(blockStart, blockEnd);
    const titleMatch = block.match(
      /class="bp_designation"[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/i,
    );
    const title = titleMatch ? stripHtml(titleMatch[1]) : undefined;

    hits.push({ url, title: title || undefined });
    if (hits.length >= limit) break;
  }

  return hits;
}

export function parseEspritJeuProductHtml(
  html: string,
  url: string,
): EspritJeuProduct {
  const ogTitle = parseMetaContent(html, "og:title");
  const hiddenName = html.match(
    /<span itemprop="name"[^>]*>\s*([^<]+?)\s*<\/span>/i,
  )?.[1];
  const images = parseEspritJeuProductImages(html);
  const gtinMatch = html.match(
    /<meta[^>]+itemprop=["']gtin13["'][^>]+content=["']([^"']+)["']/i,
  );
  const gtinAltMatch = html.match(
    /itemprop=["']gtin13["'][^>]+content=["']([^"']+)["']/i,
  );
  const barcodeRaw = gtinMatch?.[1] ?? gtinAltMatch?.[1];

  const title =
    cleanEspritJeuTitle(hiddenName ? stripHtml(hiddenName) : undefined) ||
    cleanEspritJeuTitle(ogTitle) ||
    undefined;

  const ogImage = parseMetaContent(html, "og:image");
  const imageUrl = images[0] || ogImage;

  return {
    title,
    description:
      parseMetaContent(html, "og:description") ||
      parseMetaContent(html, "description"),
    imageUrl,
    images: images.length > 0 ? images : undefined,
    barcode: barcodeRaw?.replace(/[^\d]/g, ""),
    priceCents: parseFrenchPrice(html),
    productUrl: url,
    listingTitles: title ? [title] : undefined,
  };
}

export async function searchEspritJeuHits(
  query: string,
  barcode?: string | null,
  limit = 8,
): Promise<EspritJeuSearchHit[]> {
  const cleanedQuery = query.trim();
  const normalizedBarcode = normalizeProductBarcode(barcode);
  const searchTerm = normalizedBarcode || cleanedQuery;
  if (!searchTerm) return [];

  try {
    const response = await fetchGetWithFlareFallback(
      `${BASE_URL}/dhtml/resultat_recherche.php`,
      {
        params: { keywords: searchTerm },
        headers: HEADERS,
        timeout: 10_000,
      },
    );
    return parseEspritJeuSearchHits(response.data as string, limit);
  } catch (error) {
    console.error("[Esprit Jeu] Search failed:", error);
    return [];
  }
}

export async function fetchEspritJeuProduct(
  url: string,
): Promise<EspritJeuProduct> {
  const response = await fetchGetWithFlareFallback(url, {
    headers: HEADERS,
    timeout: 10_000,
  });
  return parseEspritJeuProductHtml(response.data as string, url);
}

export type EspritJeuBarcodeHit = {
  title: string;
  imageUrl?: string | null;
  priceCents?: number | null;
};

export async function fetchEspritJeuBarcodeProduct(
  barcode: string,
): Promise<EspritJeuBarcodeHit | null> {
  const normalizedBarcode = normalizeProductBarcode(barcode);
  if (!normalizedBarcode) return null;

  try {
    const hits = await searchEspritJeuHits("", normalizedBarcode, 4);
    for (const hit of hits) {
      const product = await fetchEspritJeuProduct(hit.url);
      if (!product.title) continue;

      const resolvedBarcode = normalizeProductBarcode(product.barcode);
      if (
        resolvedBarcode &&
        !barcodesEquivalent(resolvedBarcode, normalizedBarcode)
      ) {
        continue;
      }

      return {
        title: product.title,
        imageUrl: product.imageUrl || null,
        priceCents: product.priceCents ?? null,
      };
    }

    return null;
  } catch (error) {
    console.error("[Esprit Jeu] Barcode lookup failed:", error);
    return null;
  }
}
