import {
  fetchGetWithFlareFallback,
  scrapeAccessBlocked,
} from "@/lib/http/scrapeFetch";
import { NAME_ONLY_RETAILER_TITLE_MIN_SIMILARITY } from "@/core/commerce/retailer/titleMatch";
import { metadataTitleSimilarity } from "@/core/enrich/titleMatching";
import { retailerCatalogBarcodeGate } from "@/core/commerce/retailer/productUrl";
import {
  barcodesEquivalent,
  normalizeProductBarcode,
} from "@/core/identify/normalize";

import {
  extractEditionYearFromProductName,
  parseFrenchPriceCents,
  parseIqitRenderedProducts,
  parsePrestashopProductPageBarcode,
  parsePrestashopShortDescription,
  pickPrestashopCoverUrl,
  resolvePrestashopSearchProductBarcode,
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

export class PrestashopAccessDeniedError extends Error {
  readonly retailerId: string;

  constructor(retailerId: string, message: string) {
    super(message);
    this.name = "PrestashopAccessDeniedError";
    this.retailerId = retailerId;
  }
}

function prestashopAccessDeniedMessage(
  config: PrestashopRetailerConfig,
  status: number,
  body: unknown,
): string | null {
  if (scrapeAccessBlocked(status, body)) {
    if (status === 401 || status === 403) {
      return `${config.label} search blocked (HTTP ${status}) — set FLARESOLVERR_URL or run from an unblocked network`;
    }
    return `${config.label} search blocked by storefront protection — set FLARESOLVERR_URL or run from an unblocked network`;
  }
  return null;
}

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
    const response = await fetchGetWithFlareFallback(productUrl, {
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
    barcode: resolvePrestashopSearchProductBarcode(product),
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
      const productBarcode = resolvePrestashopSearchProductBarcode(product);
      return barcodesEquivalent(productBarcode, normalizedBarcode);
    });
    if (barcodeHit) return barcodeHit;
  }

  const queries =
    options?.queries?.map((query) => query.trim()).filter(Boolean) ?? [];
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

/** SearchYield already has EAN (field, URL slug, or reference) — no fiche GET. */
function prestashopSearchProductNeedsEanEnrich(
  product: PrestashopSearchProduct,
): boolean {
  return (
    !resolvePrestashopSearchProductBarcode(product) && Boolean(product.link)
  );
}

function prestashopSearchProductKey(product: PrestashopSearchProduct): string {
  return (
    product.link ||
    product.id_product?.toString() ||
    stripHtml(product.name || "")
  );
}

async function enrichPrestashopSearchProductWithEan(
  config: PrestashopRetailerConfig,
  product: PrestashopSearchProduct,
): Promise<PrestashopSearchProduct> {
  if (!prestashopSearchProductNeedsEanEnrich(product) || !product.link) {
    return product;
  }
  try {
    const response = await fetchGetWithFlareFallback(product.link, {
      headers: HTML_HEADERS,
      timeout: config.requestTimeoutMs ?? 10000,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    const ean13 = parsePrestashopProductPageBarcode(String(response.data));
    return ean13 ? { ...product, ean13 } : product;
  } catch {
    return product;
  }
}

/** Cap detail GETs when IQIT/search miniatures omit EAN (1 search → shortlist). */
const PRESTASHOP_EAN_ENRICH_MAX = 3;

/**
 * Detail-enrich only rows that lack a SearchYield barcode. Title-rank, sequential,
 * stop when the target barcode matches — never Promise.all every miniature.
 */
async function enrichPrestashopSearchProductsWithEan(
  config: PrestashopRetailerConfig,
  products: PrestashopSearchProduct[],
  options?: { barcode?: string | null; queries?: string[] },
): Promise<PrestashopSearchProduct[]> {
  const normalizedBarcode = normalizeProductBarcode(options?.barcode);
  if (
    normalizedBarcode &&
    pickBestPrestashopHit(products, { barcode: normalizedBarcode })
  ) {
    return products;
  }

  const needsEnrich = products.filter(prestashopSearchProductNeedsEanEnrich);
  if (needsEnrich.length === 0) return products;

  const queries =
    options?.queries?.map((query) => query.trim()).filter(Boolean) ?? [];
  const ranked = [...needsEnrich].sort((a, b) => {
    if (queries.length === 0) return 0;
    const score = (product: PrestashopSearchProduct) => {
      const title = stripHtml(product.name || "");
      if (!title) return -1;
      return Math.max(
        ...queries.map((query) => metadataTitleSimilarity(query, title)),
      );
    };
    return score(b) - score(a);
  });

  const updated = new Map<string, PrestashopSearchProduct>();
  for (const product of ranked.slice(0, PRESTASHOP_EAN_ENRICH_MAX)) {
    const enriched = await enrichPrestashopSearchProductWithEan(
      config,
      product,
    );
    updated.set(prestashopSearchProductKey(product), enriched);
    if (
      normalizedBarcode &&
      barcodesEquivalent(
        resolvePrestashopSearchProductBarcode(enriched),
        normalizedBarcode,
      )
    ) {
      break;
    }
  }

  return products.map(
    (product) => updated.get(prestashopSearchProductKey(product)) ?? product,
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

  const response = await fetchGetWithFlareFallback(url.toString(), {
    headers: HEADERS,
    timeout: timeoutMs,
    validateStatus: (status) => status >= 200 && status < 500,
  });

  const denied = prestashopAccessDeniedMessage(
    config,
    response.status,
    response.data,
  );
  if (denied) {
    throw new PrestashopAccessDeniedError(config.id, denied);
  }

  const payload =
    response.data && typeof response.data === "object"
      ? (response.data as Record<string, unknown>)
      : null;

  if (config.searchStrategy === "iqit") {
    const rendered = payload?.rendered_products;
    return typeof rendered === "string"
      ? parseIqitRenderedProducts(rendered)
      : [];
  }

  const products = payload?.products;
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

  const queries =
    lookupQueries && lookupQueries.length > 0
      ? lookupQueries
      : [query.trim()].filter(Boolean);

  // SearchYield-first: mine URL/reference/ean13 before any fiche Flare GET.
  if (
    normalizedBarcode &&
    !pickBestPrestashopHit(products, { barcode: normalizedBarcode })
  ) {
    products = await enrichPrestashopSearchProductsWithEan(config, products, {
      barcode: normalizedBarcode,
      queries,
    });
  }

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
  productUrl?: string | null;
  priceCents?: number | null;
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
    const gate = retailerCatalogBarcodeGate({
      productUrl: product.productUrl,
      productBarcode: product.barcode,
      itemBarcode: normalizedBarcode,
    });
    if (!gate.catalogBarcodeConfirmed || gate.barcodeContradicted) {
      return null;
    }

    return {
      title: product.title,
      imageUrl: product.imageUrl || null,
      productUrl: product.productUrl,
      priceCents: product.priceCents ?? null,
    };
  } catch (error) {
    console.error(`[${config.label}] Barcode lookup failed:`, error);
    return null;
  }
}
