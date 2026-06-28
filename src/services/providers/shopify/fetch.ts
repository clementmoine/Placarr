import axios from "axios";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";

import type { ShopifyProduct, ShopifyRetailerConfig } from "./types";

const HTML_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

const JSON_HEADERS = {
  "User-Agent": HTML_HEADERS["User-Agent"],
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

export function stripHtml(html?: string | null): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

/**
 * Shopify's predictive search (`/search/suggest.json`) does NOT index the
 * barcode, but the full search page DOES — so we read product handles from the
 * `/search?q={ean}` HTML, then fetch their clean product JSON. The page also
 * carries non-result `/products/…` links (a gift-card promo in the header, etc.),
 * so we return ALL handles (deduped, in order) and let the caller confirm by
 * barcode rather than trusting the first one.
 */
export function extractProductHandles(html: string): string[] {
  const handles: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/\/products\/([a-z0-9][a-z0-9_-]*)/gi)) {
    const handle = match[1];
    if (seen.has(handle)) continue;
    seen.add(handle);
    handles.push(handle);
  }
  return handles;
}

type ShopifyVariant = { barcode?: string | null; price?: string | null };
type ShopifyJsonProduct = {
  title?: string;
  handle?: string;
  body_html?: string;
  vendor?: string;
  image?: { src?: string } | null;
  images?: Array<{ src?: string }>;
  variants?: ShopifyVariant[];
};

function priceToCents(price?: string | null): number | undefined {
  if (!price) return undefined;
  const value = Number.parseFloat(String(price).replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * 100) : undefined;
}

/**
 * Pick the variant whose barcode matches the scanned EAN (so the right edition's
 * price/barcode is used); fall back to the first variant otherwise.
 */
function pickVariant(
  variants: ShopifyVariant[] | undefined,
  barcode?: string | null,
): ShopifyVariant | undefined {
  if (!variants || variants.length === 0) return undefined;
  const normalized = normalizeProductBarcode(barcode);
  if (normalized) {
    const exact = variants.find(
      (variant) => normalizeProductBarcode(variant.barcode) === normalized,
    );
    if (exact) return exact;
  }
  return variants[0];
}

function mapShopifyJsonProduct(
  config: ShopifyRetailerConfig,
  product: ShopifyJsonProduct,
  barcode?: string | null,
): ShopifyProduct | null {
  if (!product?.title || !product.handle) return null;
  const variant = pickVariant(product.variants, barcode);
  const cover = product.image?.src || product.images?.[0]?.src || undefined;
  const gallery = (product.images || [])
    .map((image) => image?.src)
    .filter((src): src is string => Boolean(src) && src !== cover);

  return {
    title: product.title.trim(),
    description: stripHtml(product.body_html),
    imageUrl: cover ? cover.split("?")[0] : undefined,
    galleryImages: gallery.map((src) => src.split("?")[0]),
    barcode: normalizeProductBarcode(variant?.barcode) || undefined,
    manufacturer: product.vendor?.trim() || undefined,
    priceCents: priceToCents(variant?.price),
    productUrl: `${config.baseUrl}/products/${product.handle}`,
    source: config.id,
  };
}

export async function fetchShopifyProductByHandle(
  config: ShopifyRetailerConfig,
  handle: string,
  barcode?: string | null,
): Promise<ShopifyProduct | null> {
  const response = await axios.get(
    `${config.baseUrl}/products/${handle}.json`,
    {
      headers: JSON_HEADERS,
      timeout: 12000,
      validateStatus: (status) => status >= 200 && status < 500,
    },
  );
  const product = response.data?.product as ShopifyJsonProduct | undefined;
  if (!product) return null;
  return mapShopifyJsonProduct(config, product, barcode);
}

// How many distinct search-result handles to inspect before giving up — enough
// to skip the header/footer non-result links, few enough to stay cheap.
const DEFAULT_HANDLE_CANDIDATES = 5;

async function fetchShopifySearchHandles(
  config: ShopifyRetailerConfig,
  query: string,
  barcode?: string | null,
): Promise<string[]> {
  const searchValue = (barcode || query).trim();
  if (!searchValue) return [];

  const normalizedBarcode = normalizeProductBarcode(barcode);
  const url = new URL("/search", config.baseUrl);
  url.searchParams.set("q", searchValue);
  url.searchParams.set("type", "product");

  const response = await axios.get(url.toString(), {
    headers: HTML_HEADERS,
    timeout: 12000,
    validateStatus: (status) => status >= 200 && status < 500,
  });
  if (typeof response.data !== "string") return [];

  const handles = extractProductHandles(response.data);
  if (normalizedBarcode) {
    handles.sort(
      (a, b) =>
        (b.includes(normalizedBarcode) ? 1 : 0) -
        (a.includes(normalizedBarcode) ? 1 : 0),
    );
  }
  return handles;
}

export async function searchShopifyHits(
  config: ShopifyRetailerConfig,
  query: string,
  barcode?: string | null,
  hitLimit = DEFAULT_HANDLE_CANDIDATES,
): Promise<ShopifyProduct[]> {
  const handles = await fetchShopifySearchHandles(config, query, barcode);
  const products: ShopifyProduct[] = [];

  for (const handle of handles.slice(0, hitLimit)) {
    const product = await fetchShopifyProductByHandle(config, handle, barcode);
    if (product) products.push(product);
  }

  return products;
}

export async function searchShopifyProduct(
  config: ShopifyRetailerConfig,
  query: string,
  barcode?: string | null,
): Promise<ShopifyProduct | null> {
  const normalizedBarcode = normalizeProductBarcode(barcode);
  const hits = await searchShopifyHits(
    config,
    query,
    barcode,
    DEFAULT_HANDLE_CANDIDATES,
  );

  if (normalizedBarcode) {
    return (
      hits.find(
        (product) =>
          normalizeProductBarcode(product.barcode) === normalizedBarcode,
      ) ?? null
    );
  }

  return hits[0] ?? null;
}

export type ShopifyBarcodeHit = {
  title: string;
  imageUrl?: string | null;
};

export async function fetchShopifyBarcodeProduct(
  config: ShopifyRetailerConfig,
  barcode: string,
): Promise<ShopifyBarcodeHit | null> {
  const normalizedBarcode = normalizeProductBarcode(barcode);
  if (!normalizedBarcode) return null;

  try {
    const product = await searchShopifyProduct(config, "", normalizedBarcode);
    // Trust only a barcode the product's own variant confirms.
    if (
      !product?.title ||
      normalizeProductBarcode(product.barcode) !== normalizedBarcode
    ) {
      return null;
    }
    return { title: product.title, imageUrl: product.imageUrl || null };
  } catch (error) {
    console.error(`[${config.label}] Barcode lookup failed:`, error);
    return null;
  }
}
