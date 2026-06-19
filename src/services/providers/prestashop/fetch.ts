import axios from "axios";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";

import {
  extractBarcodeFromProductUrl,
  extractEditionYearFromProductName,
  parseFrenchPriceCents,
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
  barcode?: string | null,
): PrestashopSearchProduct | null {
  if (products.length === 0) return null;

  const normalizedBarcode = normalizeProductBarcode(barcode);
  if (normalizedBarcode) {
    const barcodeHit = products.find((product) => {
      const productBarcode =
        normalizeProductBarcode(product.ean13) ||
        extractBarcodeFromProductUrl(product.link);
      return productBarcode === normalizedBarcode;
    });
    if (barcodeHit) return barcodeHit;
  }

  return products[0];
}

export async function searchPrestashopProduct(
  config: PrestashopRetailerConfig,
  query: string,
  barcode?: string | null,
): Promise<PrestashopProduct | null> {
  const searchValue = (barcode || query).trim();
  if (!searchValue) return null;

  const url = new URL(config.searchPath, config.baseUrl);
  url.searchParams.set("controller", "search");
  url.searchParams.set(config.searchParam, searchValue);
  url.searchParams.set("ajax", "1");

  const response = await axios.get(url.toString(), {
    headers: HEADERS,
    timeout: 12000,
    validateStatus: (status) => status >= 200 && status < 500,
  });

  const products = response.data?.products;
  if (!Array.isArray(products) || products.length === 0) return null;

  const hit = pickBestPrestashopHit(products, barcode);
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
