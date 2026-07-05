import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";

import {
  barcodesEquivalent,
  normalizeProductBarcode,
} from "@/core/barcode/normalize";

const BASE_URL = "https://www.play-in.com";
const BOARDGAME_CATALOGUE_PATH = "/fr/gamme/5/jeux-de-societe/catalogue";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

export interface PlayInSearchHit {
  url: string;
  productId?: string;
}

export interface PlayInProduct {
  title?: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  barcode?: string;
  reference?: string;
  priceCents?: number;
  productUrl: string;
  listingTitles?: string[];
}

type PlayInJsonLd = {
  name?: string;
  description?: string;
  image?: string;
  images?: string[];
  gtin?: string;
  sku?: string;
  priceCents?: number;
};

function normalizeGtin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/[^\d]/g, "");
  return digits || undefined;
}

function parsePriceCents(raw: unknown): number | undefined {
  const amount =
    typeof raw === "number"
      ? raw
      : Number.parseFloat(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(amount)) return undefined;
  return Math.round(amount * 100);
}

function parseJsonLdProductNode(product: Record<string, unknown>): PlayInJsonLd {
  const offers = (product.offers as Record<string, unknown>) || {};
  const lowPriceRaw = offers.lowPrice ?? offers.price;
  const imageRaw = product.image;
  const images = Array.isArray(imageRaw)
    ? imageRaw.filter((entry): entry is string => typeof entry === "string")
    : typeof imageRaw === "string"
      ? [imageRaw]
      : [];

  const gtin =
    normalizeGtin(
      typeof product.gtin14 === "string"
        ? product.gtin14
        : typeof product.gtin13 === "string"
          ? product.gtin13
          : typeof product.gtin === "string"
            ? product.gtin
            : undefined,
    ) || undefined;

  return {
    name: typeof product.name === "string" ? product.name.trim() : undefined,
    description:
      typeof product.description === "string"
        ? product.description.trim()
        : undefined,
    image: images[0],
    images: images.length > 0 ? images : undefined,
    gtin,
    sku: typeof product.sku === "string" ? product.sku.trim() : undefined,
    priceCents: parsePriceCents(lowPriceRaw),
  };
}

/** Parse schema.org Product JSON-LD from standard scripts or Next.js RSC payloads. */
export function parsePlayInProductJsonLd(html: string): PlayInJsonLd {
  for (const match of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const nodes = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const product = node as Record<string, unknown>;
      const type = product["@type"];
      const isProduct = Array.isArray(type)
        ? type.includes("Product")
        : type === "Product";
      if (!isProduct) continue;
      return parseJsonLdProductNode(product);
    }
  }

  const escapedMarker = '\\"@type\\":\\"Product\\"';
  const markerIndex = html.indexOf(escapedMarker);
  if (markerIndex === -1) return {};

  const chunk = html.slice(
    Math.max(0, markerIndex - 120),
    markerIndex + 3500,
  );
  const name = chunk.match(/\\"name\\":\\"([^"\\]+)\\"/)?.[1];
  const description = chunk.match(/\\"description\\":\\"([^"\\]+)\\"/)?.[1];
  const gtin14 = chunk.match(/\\"gtin14\\":\\"(\d+)\\"/)?.[1];
  const gtin13 = chunk.match(/\\"gtin13\\":\\"(\d+)\\"/)?.[1];
  const sku = chunk.match(/\\"sku\\":\\"([^"\\]+)\\"/)?.[1];
  const priceRaw = chunk.match(/\\"price\\":(\d+(?:\.\d+)?)/)?.[1];
  const imageMatches = [
    ...chunk.matchAll(/\\"image\\":\[\\"([^"\\]+)\\"/g),
    ...chunk.matchAll(/\\"image\\":\\"([^"\\]+)\\"/g),
  ];
  const images = imageMatches
    .map((match) => match[1]?.trim())
    .filter((url): url is string => Boolean(url));

  return {
    name: name ? decodeHTMLEntities(name) : undefined,
    description: description ? decodeHTMLEntities(description) : undefined,
    image: images[0],
    images: images.length > 0 ? images : undefined,
    gtin: normalizeGtin(gtin14 || gtin13),
    sku,
    priceCents: parsePriceCents(priceRaw),
  };
}

export function parsePlayInCatalogueHits(
  html: string,
  limit = 8,
): PlayInSearchHit[] {
  const seen = new Set<string>();
  const hits: PlayInSearchHit[] = [];

  const pushPath = (rawPath: string): boolean => {
    const path = rawPath.trim();
    const match = path.match(/\/fr\/produit\/(\d+)\/([^/?#]+)/i);
    if (!match) return false;
    const productId = match[1];
    if (seen.has(productId)) return false;
    seen.add(productId);
    hits.push({
      url: `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`,
      productId,
    });
    return hits.length >= limit;
  };

  for (const match of html.matchAll(
    /\\"url\\":\\"(\/fr\/produit\/\d+\/[^"\\]+)\\"/g,
  )) {
    if (pushPath(match[1])) return hits;
  }

  for (const match of html.matchAll(
    /"url"\s*:\s*"(\/fr\/produit\/\d+\/[^"\\]+)"/g,
  )) {
    if (pushPath(match[1])) return hits;
  }

  if (hits.length > 0) return hits;

  for (const match of html.matchAll(/href="(\/fr\/produit\/\d+\/[^"?#]+)"/gi)) {
    if (pushPath(match[1])) return hits;
  }

  return hits;
}

export function parsePlayInProductHtml(
  html: string,
  url: string,
): PlayInProduct {
  const jsonLd = parsePlayInProductJsonLd(html);
  const images = jsonLd.images ?? (jsonLd.image ? [jsonLd.image] : []);

  return {
    title: jsonLd.name,
    description: jsonLd.description,
    imageUrl: images[0],
    images: images.length > 0 ? images : undefined,
    barcode: jsonLd.gtin,
    reference: jsonLd.sku,
    priceCents: jsonLd.priceCents,
    productUrl: url,
    listingTitles: jsonLd.name ? [jsonLd.name] : undefined,
  };
}

export async function searchPlayInHits(
  query: string,
  _barcode?: string | null,
  limit = 8,
): Promise<PlayInSearchHit[]> {
  const cleanedQuery = query.trim();
  if (!cleanedQuery) return [];

  try {
    const response = await axios.get(`${BASE_URL}${BOARDGAME_CATALOGUE_PATH}`, {
      params: { search: cleanedQuery },
      headers: HEADERS,
      timeout: 10_000,
    });
    return parsePlayInCatalogueHits(response.data as string, limit);
  } catch (error) {
    console.error("[Play-In] Search failed:", error);
    return [];
  }
}

export async function fetchPlayInProduct(url: string): Promise<PlayInProduct> {
  const response = await axios.get(url, { headers: HEADERS, timeout: 10_000 });
  return parsePlayInProductHtml(response.data as string, url);
}

export type PlayInBarcodeHit = {
  title: string;
  imageUrl?: string | null;
  priceCents?: number | null;
};

export async function fetchPlayInBarcodeProduct(
  barcode: string,
): Promise<PlayInBarcodeHit | null> {
  const normalizedBarcode = normalizeProductBarcode(barcode);
  if (!normalizedBarcode) return null;

  try {
    const hits = await searchPlayInHits(normalizedBarcode, null, 6);
    for (const hit of hits) {
      const product = await fetchPlayInProduct(hit.url);
      if (!product.title) continue;

      const resolvedBarcode = normalizeProductBarcode(product.barcode);
      if (
        resolvedBarcode &&
        barcodesEquivalent(resolvedBarcode, normalizedBarcode)
      ) {
        return {
          title: product.title,
          imageUrl: product.imageUrl || null,
          priceCents: product.priceCents ?? null,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("[Play-In] Barcode lookup failed:", error);
    return null;
  }
}
