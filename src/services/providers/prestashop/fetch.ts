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
