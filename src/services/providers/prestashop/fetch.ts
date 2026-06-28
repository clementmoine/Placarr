import axios from "axios";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import { metadataTitleSimilarity } from "@/lib/metadata/titleMatching";

import { NAME_ONLY_RETAILER_TITLE_MIN_SIMILARITY } from "@/lib/retailer/titleMatch";

import {
  extractBarcodeFromProductUrl,
  extractEditionYearFromProductName,
  parseFrenchPriceCents,
  parseIqitRenderedProducts,
  parsePrestashopProductPageBarcode,
  parsePrestashopShortDescription,
  pickPrestashopCoverUrl,
  stripHtml,
} from "./parse";

import type {
  PrestashopProduct,
  PrestashopRetailerConfig,
  PrestashopSearchProduct,
} from "./types";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

const HTML_HEADERS = {
  "User-Agent": HEADERS["User-Agent"],
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

/** Identifiant numérique d'une image dans une URL PrestaShop (`/{id}[-{size}]/`). */
export function prestashopImageId(url?: string | null): string | null {
  if (!url) return null;
  return (
    url.match(/\/(\d+)(?:-[a-z_]+)?\/[^/?#]+\.(?:jpe?g|png|webp|gif)/i)?.[1] ??
    null
  );
}

/**
 * Extrait la galerie produit d'une page PrestaShop via `data-image-large-src`,
 * convention du thème standard. Ce sélecteur ne porte que les images du produit
 * courant (les cross-sell utilisent un autre markup), donc aucun risque de
 * récupérer les photos d'un autre produit.
 */
export function parsePrestashopGallery(html: string): string[] {
  const seen = new Set<string>();
  const images: string[] = [];
  for (const match of html.matchAll(/data-image-large-src="([^"]+)"/gi)) {
    const url = match[1].split(/[?#]/)[0].trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    images.push(url);
  }
  return images;
}

/** Récupère la galerie produit en chargeant la page (chemin métadonnée only). */
export async function fetchPrestashopGallery(
  productUrl: string,
): Promise<string[]> {
  if (!productUrl || !/^https?:\/\//i.test(productUrl)) return [];
  try {
    const response = await axios.get(productUrl, {
      headers: HTML_HEADERS,
      timeout: 10000,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    return parsePrestashopGallery(String(response.data));
  } catch {
    return [];
  }
}

export function mapPrestashopSearchProduct(
  config: PrestashopRetailerConfig,
  product: PrestashopSearchProduct,
): PrestashopProduct | null {
  const title = stripHtml(product.name || "");
  if (!title) return null;

  const shortHtml = product.description_short || "";
  const parsedShort = parsePrestashopShortDescription(shortHtml);
  const description =
    parsedShort.description || (shortHtml ? stripHtml(shortHtml) : undefined);

  return {
    title,
    description: description || undefined,
    imageUrl: pickPrestashopCoverUrl(product),
    barcode:
      normalizeProductBarcode(product.ean13) ||
      normalizeProductBarcode(product.reference) ||
      extractBarcodeFromProductUrl(product.link),
    reference: product.reference?.trim() || undefined,
    releaseDate: extractEditionYearFromProductName(title),
    manufacturer: product.manufacturer_name?.trim() || undefined,
    priceCents: parseFrenchPriceCents(product.price_amount, product.price),
    players: parsedShort.players,
    playtime: parsedShort.playtime,
    ageRating: parsedShort.ageRating,
    productUrl: product.link || config.baseUrl,
    source: config.id,
  };
}

function pickBestPrestashopHit(
  products: PrestashopSearchProduct[],
  options?: { barcode?: string | null; queries?: string[] },
): PrestashopSearchProduct | null {
  if (products.length === 0) return null;

  const normalizedBarcode = normalizeProductBarcode(options?.barcode);
  if (normalizedBarcode) {
    const barcodeHit = products.find((product) => {
      const productBarcode =
        normalizeProductBarcode(product.ean13) ||
        normalizeProductBarcode(product.reference) ||
        extractBarcodeFromProductUrl(product.link);
      return productBarcode === normalizedBarcode;
    });
    if (barcodeHit) return barcodeHit;
  }

  const queries = options?.queries?.map((query) => query.trim()).filter(Boolean) ?? [];
  if (queries.length > 0) {
    let best: PrestashopSearchProduct | null = null;
    let bestScore = -1;
    for (const product of products) {
      const title = stripHtml(product.name || "");
      if (!title) continue;
      const score = Math.max(
        ...queries.map((query) => metadataTitleSimilarity(query, title)),
      );
      if (score > bestScore) {
        bestScore = score;
        best = product;
      }
    }
    if (best && bestScore >= NAME_ONLY_RETAILER_TITLE_MIN_SIMILARITY) {
      return best;
    }
  }

  return null;
}

async function enrichPrestashopSearchProductsWithEan(
  config: PrestashopRetailerConfig,
  products: PrestashopSearchProduct[],
): Promise<PrestashopSearchProduct[]> {
  return Promise.all(
    products.map(async (product) => {
      if (product.ean13 || !product.link) return product;
      try {
        const response = await axios.get(product.link, {
          headers: HTML_HEADERS,
          timeout: config.requestTimeoutMs ?? 10000,
          validateStatus: (status) => status >= 200 && status < 400,
        });
        const ean13 = parsePrestashopProductPageBarcode(String(response.data));
        return ean13 ? { ...product, ean13 } : product;
      } catch {
        return product;
      }
    }),
  );
}

async function fetchPrestashopSearchProducts(
  config: PrestashopRetailerConfig,
  searchValue: string,
): Promise<PrestashopSearchProduct[]> {
  const timeoutMs = config.requestTimeoutMs ?? 12000;
  const url = new URL(config.searchPath, config.baseUrl);
  url.searchParams.set("controller", "search");
  url.searchParams.set(config.searchParam, searchValue);
  url.searchParams.set("ajax", "1");

  const response = await axios.get(url.toString(), {
    headers: HEADERS,
    timeout: timeoutMs,
    validateStatus: (status) => status >= 200 && status < 500,
  });

  if (config.searchStrategy === "iqit") {
    const rendered = response.data?.rendered_products;
    return typeof rendered === "string"
      ? parseIqitRenderedProducts(rendered)
      : [];
  }

  const products = response.data?.products;
  return Array.isArray(products) ? products : [];
}

export async function searchPrestashopHits(
  config: PrestashopRetailerConfig,
  searchValue: string,
): Promise<PrestashopSearchProduct[]> {
  return fetchPrestashopSearchProducts(config, searchValue);
}

export async function searchPrestashopProduct(
  config: PrestashopRetailerConfig,
  query: string,
  barcode?: string | null,
  lookupQueries?: string[],
): Promise<PrestashopProduct | null> {
  const normalizedBarcode = normalizeProductBarcode(barcode);
  const searchValue = (normalizedBarcode || query).trim();
  if (!searchValue) return null;

  let products: PrestashopSearchProduct[] = [];
  if (normalizedBarcode) {
    products = await fetchPrestashopSearchProducts(config, normalizedBarcode);
  } else {
    const queries =
      lookupQueries && lookupQueries.length > 0
        ? lookupQueries
        : [query.trim()].filter(Boolean);
    const seen = new Set<string>();
    for (const searchQuery of queries) {
      const hits = await fetchPrestashopSearchProducts(config, searchQuery);
      for (const product of hits) {
        const key =
          product.id_product?.toString() ||
          product.link ||
          stripHtml(product.name || "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        products.push(product);
      }
    }
  }

  if (products.length === 0) return null;

  if (normalizedBarcode) {
    products = await enrichPrestashopSearchProductsWithEan(config, products);
  }

  const queries =
    lookupQueries && lookupQueries.length > 0
      ? lookupQueries
      : [query.trim()].filter(Boolean);
  const hit = pickBestPrestashopHit(products, {
    barcode: normalizedBarcode,
    queries,
  });
  if (!hit) return null;

  return mapPrestashopSearchProduct(config, hit);
}

export type BarcodeProductHit = {
  title: string;
  imageUrl?: string | null;
};

export async function fetchPrestashopBarcodeProduct(
  config: PrestashopRetailerConfig,
  barcode: string,
): Promise<BarcodeProductHit | null> {
  const normalizedBarcode = normalizeProductBarcode(barcode);
  if (!normalizedBarcode) return null;

  try {
    const product = await searchPrestashopProduct(
      config,
      "",
      normalizedBarcode,
    );
    if (!product?.title) return null;
    if (normalizeProductBarcode(product.barcode) !== normalizedBarcode) {
      return null;
    }

    return {
      title: product.title,
      imageUrl: product.imageUrl || null,
    };
  } catch (error) {
    console.error(`[${config.label}] Barcode lookup failed:`, error);
    return null;
  }
}
