import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";

import { priceListingSharesItemIdentity } from "@/core/commerce/retailer/titleMatch";

import {
  cacheBackMarketHtml,
  getCachedBackMarketHtml,
} from "./cache";
import {
  promoteBackMarketSearchEvidence,
  readBackMarketSearchEvidence,
} from "./durableEvidence";

export { resetBackMarketResponseCacheForTests } from "./cache";

/**
 * Back Market (https://www.backmarket.fr) — refurbished hardware marketplace.
 * Search pages are Cloudflare-protected Nuxt apps; product cards live in the
 * `__NUXT_DATA__` payload (title, EUR price, grade, CloudFront image, /p/ URL).
 */

const BACKMARKET_BASE = "https://www.backmarket.fr";
const BACKMARKET_LOCALE = "fr-fr";
const BACKMARKET_TIMEOUT_MS = 25_000;
const BACKMARKET_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const NUXT_REACTIVE_MARKERS = new Set([
  "Reactive",
  "ShallowReactive",
  "Set",
  "Map",
]);

export type BackMarketHit = {
  title: string;
  priceCents: number;
  currency: string;
  grade?: string | null;
  coverUrl?: string | null;
  /** Product-page gallery (CloudFront). Search cards only expose `coverUrl`. */
  imageUrls?: string[];
  sourceUrl: string;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  productId?: string | null;
  reviewAverage?: number | null;
  warrantyMonths?: number | null;
};

/** Search / fiche hit used for both metadata and price refresh. */
export type BackMarketProduct = BackMarketHit;

export type BackMarketPrices = {
  priceUsed?: number;
  productName?: string | null;
  coverUrl?: string | null;
  sourceUrl?: string | null;
  grade?: string | null;
};

export function backmarketSearchUrl(query: string): string {
  const cleaned = query.replace(/\s+/g, " ").trim();
  return `${BACKMARKET_BASE}/${BACKMARKET_LOCALE}/search?q=${encodeURIComponent(cleaned)}`;
}

export function parseBackMarketProductUuidFromUrl(
  url: string | null | undefined,
): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(
    /\/(?:[a-z]{2}-[a-z]{2}\/)?p\/[^/]+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i,
  );
  return match?.[1]?.toLowerCase() ?? null;
}

function eurosToCents(amount: string | number | null | undefined): number | null {
  if (amount == null) return null;
  const raw =
    typeof amount === "number"
      ? amount
      : Number(String(amount).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.round(raw * 100);
}

function resolveNuxtValue(
  data: unknown[],
  idx: unknown,
  depth = 0,
): unknown {
  if (!Number.isInteger(idx) || typeof idx !== "number") return idx;
  if (idx < 0 || idx >= data.length || depth > 8) return null;
  const val = data[idx];
  if (
    typeof val === "string" ||
    typeof val === "number" ||
    typeof val === "boolean" ||
    val == null
  ) {
    return val;
  }
  if (Array.isArray(val)) {
    if (
      typeof val[0] === "string" &&
      NUXT_REACTIVE_MARKERS.has(val[0])
    ) {
      return null;
    }
    return val.map((entry) =>
      Number.isInteger(entry) ? resolveNuxtValue(data, entry, depth + 1) : entry,
    );
  }
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(val as Record<string, unknown>)) {
      if (Number.isInteger(entry)) {
        out[key] = resolveNuxtValue(data, entry, depth + 1);
      } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const nested: Record<string, unknown> = {};
        for (const [nestedKey, nestedVal] of Object.entries(
          entry as Record<string, unknown>,
        )) {
          nested[nestedKey] = Number.isInteger(nestedVal)
            ? resolveNuxtValue(data, nestedVal, depth + 1)
            : nestedVal;
        }
        out[key] = nested;
      } else {
        out[key] = entry;
      }
    }
    return out;
  }
  return val;
}

function productHrefFromLink(link: unknown): string | null {
  if (!link || typeof link !== "object") return null;
  const record = link as Record<string, unknown>;
  if (typeof record.href === "string" && record.href.trim()) {
    return record.href.trim();
  }
  const params = record.params;
  if (!params || typeof params !== "object") return null;
  const p = params as Record<string, unknown>;
  const locale =
    typeof p.locale === "string" && p.locale.trim()
      ? p.locale.trim()
      : BACKMARKET_LOCALE;
  const slug =
    (typeof p.slugV2 === "string" && p.slugV2) ||
    (typeof p.slug === "string" && p.slug) ||
    null;
  const uuid = typeof p.uuid === "string" ? p.uuid : null;
  if (!slug || !uuid) return null;
  return `${BACKMARKET_BASE}/${locale}/p/${slug}/${uuid}`;
}

function gradeNameFromRaw(
  data: unknown[],
  gradeRaw: unknown,
): string | null {
  if (Number.isInteger(gradeRaw)) {
    const resolved = resolveNuxtValue(data, gradeRaw);
    if (resolved && typeof resolved === "object") {
      const name = (resolved as { name?: unknown }).name;
      return typeof name === "string" ? name : null;
    }
    return null;
  }
  if (gradeRaw && typeof gradeRaw === "object") {
    const name = (gradeRaw as { name?: unknown }).name;
    if (Number.isInteger(name)) {
      const resolved = resolveNuxtValue(data, name);
      return typeof resolved === "string" ? resolved : null;
    }
    return typeof name === "string" ? name : null;
  }
  return null;
}

/**
 * Shared Nuxt payload decoder for search cards and product-page galleries.
 */
function parseNuxtDataPayload(html: string): unknown[] | null {
  const match = html.match(
    /<script[^>]*\bid=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match?.[1]) return null;
  try {
    const data = JSON.parse(match[1]);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function cloudfrontImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!/^https?:\/\/d2e6ccujb3mkqf\.cloudfront\.net\//i.test(url)) return null;
  return url;
}

type BackMarketProductCatalogNode = {
  productId: string;
  title: string;
  brand: string | null;
  model: string | null;
  slug: string | null;
  imageUrls: string[];
};

function catalogImageUrlsFromRaw(
  data: unknown[],
  imagesRaw: unknown,
): string[] {
  if (!Array.isArray(imagesRaw)) return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const imageEntry of imagesRaw) {
    const image = Number.isInteger(imageEntry)
      ? resolveNuxtValue(data, imageEntry)
      : imageEntry;
    if (!image || typeof image !== "object") {
      const direct = cloudfrontImageUrl(image);
      if (direct && !seen.has(direct)) {
        seen.add(direct);
        urls.push(direct);
      }
      continue;
    }
    const record = image as Record<string, unknown>;
    const sourceRaw = Number.isInteger(record.source)
      ? resolveNuxtValue(data, record.source)
      : record.source;
    if (
      typeof sourceRaw === "string" &&
      sourceRaw.trim() &&
      sourceRaw.trim().toUpperCase() !== "CATALOG"
    ) {
      continue;
    }
    const urlRaw = Number.isInteger(record.url)
      ? resolveNuxtValue(data, record.url)
      : record.url;
    const url = cloudfrontImageUrl(urlRaw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function parseBackMarketProductCatalogNodes(
  data: unknown[],
): BackMarketProductCatalogNode[] {
  const nodes: BackMarketProductCatalogNode[] = [];

  for (const entry of data) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    if (!("images" in row) || !("productId" in row)) continue;

    const productIdRaw = Number.isInteger(row.productId)
      ? resolveNuxtValue(data, row.productId)
      : row.productId;
    const productId =
      typeof productIdRaw === "string" || typeof productIdRaw === "number"
        ? String(productIdRaw).toLowerCase()
        : null;
    if (!productId) continue;

    const imagesRaw = Number.isInteger(row.images)
      ? resolveNuxtValue(data, row.images)
      : row.images;
    const imageUrls = catalogImageUrlsFromRaw(data, imagesRaw);
    if (imageUrls.length === 0) continue;

    const titlesRaw = Number.isInteger(row.titles)
      ? resolveNuxtValue(data, row.titles)
      : row.titles;
    const titles =
      titlesRaw && typeof titlesRaw === "object"
        ? (titlesRaw as { raw?: unknown; default?: unknown })
        : null;
    const titleFromTitles =
      (typeof titles?.raw === "string" && titles.raw.trim()) ||
      (typeof titles?.default === "string" && titles.default.trim()) ||
      "";

    const firstImage = Array.isArray(imagesRaw)
      ? Number.isInteger(imagesRaw[0])
        ? resolveNuxtValue(data, imagesRaw[0])
        : imagesRaw[0]
      : null;
    const description =
      firstImage && typeof firstImage === "object"
        ? (firstImage as { description?: unknown }).description
        : null;
    const titleFromImage =
      typeof description === "string" ? description.trim() : "";

    const title = titleFromTitles || titleFromImage;
    if (!title) continue;

    const brandRaw = Number.isInteger(row.brand)
      ? resolveNuxtValue(data, row.brand)
      : row.brand;
    const modelRaw = Number.isInteger(row.model)
      ? resolveNuxtValue(data, row.model)
      : row.model;
    const seoRaw = Number.isInteger(row.seo)
      ? resolveNuxtValue(data, row.seo)
      : row.seo;
    const slug =
      seoRaw && typeof seoRaw === "object"
        ? typeof (seoRaw as { slug?: unknown }).slug === "string"
          ? (seoRaw as { slug: string }).slug.trim()
          : null
        : null;

    nodes.push({
      productId,
      title,
      brand: typeof brandRaw === "string" ? brandRaw.trim() || null : null,
      model: typeof modelRaw === "string" ? modelRaw.trim() || null : null,
      slug,
      imageUrls,
    });
  }

  return nodes;
}

/**
 * Product-page `__NUXT_DATA__` exposes `images: [{ url, source: "CATALOG" }]`.
 * Prefer catalog shots for the product UUID when present; fall back to any
 * CloudFront gallery on the focused product node.
 */
export function parseBackMarketProductGallery(
  html: string,
  productUuid?: string | null,
): string[] {
  const data = parseNuxtDataPayload(html);
  if (!data) return [];

  const uuid = productUuid?.trim().toLowerCase() || null;
  const nodes = parseBackMarketProductCatalogNodes(data);
  if (nodes.length === 0) return [];
  const matched = uuid
    ? nodes.find((node) => node.productId === uuid)
    : undefined;
  return (matched ?? nodes[0]!).imageUrls;
}

const BACKMARKET_GRADE_LABELS: Record<string, string> = {
  PREMIUM: "Premium",
  MINT: "Parfait état",
  VERY_GOOD: "Très bon état",
  GOOD: "Bon état",
  CORRECT: "Correct",
  FAIR: "Correct",
  STALLONE: "Correct",
};

function backMarketGradeLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return BACKMARKET_GRADE_LABELS[trimmed.toUpperCase()] ?? trimmed;
}

function cheapestProductListingPrice(
  data: unknown[],
  productUuid: string,
): { priceCents: number; currency: string; grade: string | null } | null {
  let best: {
    priceCents: number;
    currency: string;
    grade: string | null;
    preferDefault: boolean;
  } | null = null;

  for (const entry of data) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    if (!("price" in row) || !("productId" in row)) continue;

    const productIdRaw = Number.isInteger(row.productId)
      ? resolveNuxtValue(data, row.productId)
      : row.productId;
    const productId =
      typeof productIdRaw === "string" || typeof productIdRaw === "number"
        ? String(productIdRaw).toLowerCase()
        : null;
    if (productId !== productUuid) continue;

    const priceRaw = Number.isInteger(row.price)
      ? resolveNuxtValue(data, row.price)
      : row.price;
    const amount =
      priceRaw && typeof priceRaw === "object"
        ? (priceRaw as { amount?: unknown }).amount
        : null;
    const currency =
      priceRaw && typeof priceRaw === "object"
        ? String((priceRaw as { currency?: unknown }).currency || "EUR")
        : "EUR";
    const priceCents = eurosToCents(
      typeof amount === "string" || typeof amount === "number" ? amount : null,
    );
    if (priceCents == null) continue;

    const gradeRaw = Number.isInteger(row.grade)
      ? resolveNuxtValue(data, row.grade)
      : row.grade;
    const labelRaw = Number.isInteger(row.label)
      ? resolveNuxtValue(data, row.label)
      : row.label;
    const gradeName =
      gradeRaw && typeof gradeRaw === "object"
        ? (gradeRaw as { name?: unknown }).name
        : typeof labelRaw === "string"
          ? labelRaw
          : null;
    const grade = backMarketGradeLabel(gradeName);
    const preferDefault = row.defaultForMarket === true;

    if (
      !best ||
      (preferDefault && !best.preferDefault) ||
      (preferDefault === best.preferDefault && priceCents < best.priceCents)
    ) {
      best = { priceCents, currency, grade, preferDefault };
    }
  }

  return best
    ? {
        priceCents: best.priceCents,
        currency: best.currency,
        grade: best.grade,
      }
    : null;
}

/**
 * Product detail pages do not expose search-card rows (`productPageLink`).
 * Rebuild a hit from the focused catalog node + cheapest matching listing.
 */
export function parseBackMarketProductPage(
  html: string,
  productUuid: string,
): BackMarketHit | null {
  const data = parseNuxtDataPayload(html);
  if (!data) return null;

  const uuid = productUuid.trim().toLowerCase();
  if (!uuid) return null;

  const nodes = parseBackMarketProductCatalogNodes(data);
  const node = nodes.find((candidate) => candidate.productId === uuid);
  if (!node) return null;

  const listing = cheapestProductListingPrice(data, uuid);
  const slug = node.slug || "product";
  const sourceUrl = `${BACKMARKET_BASE}/${BACKMARKET_LOCALE}/p/${slug}/${uuid}`;

  return {
    title: node.title,
    priceCents: listing?.priceCents ?? 0,
    currency: listing?.currency ?? "EUR",
    grade: listing?.grade ?? null,
    coverUrl: node.imageUrls[0] ?? null,
    imageUrls: node.imageUrls,
    sourceUrl,
    brand: node.brand,
    model: node.model,
    productId: uuid,
  };
}

function withProductGallery(
  product: BackMarketHit,
  imageUrls: string[],
): BackMarketHit {
  if (imageUrls.length === 0) return product;
  return {
    ...product,
    coverUrl: imageUrls[0] ?? product.coverUrl,
    imageUrls,
  };
}

/**
 * Extract refurbished product cards from a Back Market search (or PLP) HTML
 * document's `__NUXT_DATA__` payload.
 */
export function parseBackMarketSearchHits(html: string): BackMarketHit[] {
  const data = parseNuxtDataPayload(html);
  if (!data) return [];

  const hits: BackMarketHit[] = [];
  const seen = new Set<string>();

  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (!("productPageLink" in row) || !("price" in row) || !("title" in row)) {
      continue;
    }

    const titleRaw = Number.isInteger(row.title)
      ? resolveNuxtValue(data, row.title)
      : row.title;
    const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
    if (!title) continue;

    const priceRaw = Number.isInteger(row.price)
      ? resolveNuxtValue(data, row.price)
      : row.price;
    const amount =
      priceRaw && typeof priceRaw === "object"
        ? (priceRaw as { amount?: unknown }).amount
        : null;
    const currency =
      priceRaw && typeof priceRaw === "object"
        ? String((priceRaw as { currency?: unknown }).currency || "EUR")
        : "EUR";
    const priceCents = eurosToCents(
      typeof amount === "string" || typeof amount === "number" ? amount : null,
    );
    if (priceCents == null) continue;

    const linkRaw = Number.isInteger(row.productPageLink)
      ? resolveNuxtValue(data, row.productPageLink)
      : row.productPageLink;
    const sourceUrl = productHrefFromLink(linkRaw);
    if (!sourceUrl) continue;

    const dedupeKey = parseBackMarketProductUuidFromUrl(sourceUrl) || sourceUrl;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const imageRaw = Number.isInteger(row.image)
      ? resolveNuxtValue(data, row.image)
      : row.image;
    const brandRaw = Number.isInteger(row.brand)
      ? resolveNuxtValue(data, row.brand)
      : row.brand;
    const brandCleanRaw = Number.isInteger(row.brandClean)
      ? resolveNuxtValue(data, row.brandClean)
      : row.brandClean;
    const modelRaw = Number.isInteger(row.model)
      ? resolveNuxtValue(data, row.model)
      : row.model;
    const modelCleanRaw = Number.isInteger(row.modelClean)
      ? resolveNuxtValue(data, row.modelClean)
      : row.modelClean;
    const categoryRaw = Number.isInteger(row.category)
      ? resolveNuxtValue(data, row.category)
      : row.category;
    const productIdRaw = Number.isInteger(row.productId)
      ? resolveNuxtValue(data, row.productId)
      : row.productId;
    const warrantyRaw = Number.isInteger(row.warrantyDuration)
      ? resolveNuxtValue(data, row.warrantyDuration)
      : row.warrantyDuration;
    const reviewRaw = Number.isInteger(row.reviewRating)
      ? resolveNuxtValue(data, row.reviewRating)
      : row.reviewRating;
    const reviewAverage =
      reviewRaw && typeof reviewRaw === "object"
        ? Number((reviewRaw as { average?: unknown }).average)
        : null;

    hits.push({
      title,
      priceCents,
      currency,
      grade: gradeNameFromRaw(data, row.grade),
      coverUrl: typeof imageRaw === "string" ? imageRaw : null,
      sourceUrl,
      brand:
        (typeof brandRaw === "string" && brandRaw.trim()) ||
        (typeof brandCleanRaw === "string" && brandCleanRaw.trim()) ||
        null,
      model:
        (typeof modelRaw === "string" && modelRaw.trim()) ||
        (typeof modelCleanRaw === "string" && modelCleanRaw.trim()) ||
        null,
      category: typeof categoryRaw === "string" ? categoryRaw : null,
      productId:
        typeof productIdRaw === "string" || typeof productIdRaw === "number"
          ? String(productIdRaw)
          : null,
      reviewAverage:
        reviewAverage != null && Number.isFinite(reviewAverage)
          ? reviewAverage
          : null,
      warrantyMonths:
        typeof warrantyRaw === "number" && Number.isFinite(warrantyRaw)
          ? warrantyRaw
          : null,
    });
  }

  return hits;
}

async function fetchBackMarketHtml(
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<string | null> {
  const cached = getCachedBackMarketHtml(url);
  if (cached !== undefined) {
    console.info(`[Back Market] HTML cache hit for ${url}`);
    return cached || null;
  }

  const res = await fetchGetWithFlareFallback(url, {
    headers: {
      "User-Agent": BACKMARKET_USER_AGENT,
      "Accept-Language": "fr-FR,fr;q=0.9",
      Accept: "text/html,application/xhtml+xml",
    },
    timeout: BACKMARKET_TIMEOUT_MS,
    responseType: "text",
    signal: options.signal,
    flareMaxTimeoutMs: 90_000,
  });
  const html = typeof res.data === "string" ? res.data : "";
  if (html) cacheBackMarketHtml(url, html);
  return html || null;
}

function canonicalBackMarketProductUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.split("?")[0] ?? url;
  }
}

/**
 * Product pages carry the full catalog gallery; search cards only expose one
 * thumbnail. Metadata resolve pays for the extra Flare round-trip.
 */
export async function enrichBackMarketProductGallery(
  product: BackMarketProduct,
  options: { signal?: AbortSignal } = {},
): Promise<BackMarketProduct> {
  if ((product.imageUrls?.length ?? 0) > 1) return product;
  const uuid = parseBackMarketProductUuidFromUrl(product.sourceUrl);
  if (!uuid || !product.sourceUrl) return product;

  const html = await fetchBackMarketHtml(
    canonicalBackMarketProductUrl(product.sourceUrl),
    options,
  );
  if (!html) return product;

  return withProductGallery(
    product,
    parseBackMarketProductGallery(html, uuid),
  );
}

function pricesFromHit(hit: BackMarketHit): BackMarketPrices {
  return {
    priceUsed: hit.priceCents,
    productName: hit.title,
    coverUrl: hit.coverUrl,
    sourceUrl: hit.sourceUrl,
    grade: hit.grade,
  };
}

function pickBestHit(
  hits: BackMarketHit[],
  expectedNames: string[],
  shelfType?: string | null,
): BackMarketHit | null {
  const aligned = hits.filter((hit) => {
    if (expectedNames.length === 0) return true;
    return expectedNames.some((name) =>
      priceListingSharesItemIdentity(name, hit.title, { shelfType }),
    );
  });
  if (aligned.length === 0) return null;
  return aligned.reduce((best, hit) =>
    hit.priceCents < best.priceCents ? hit : best,
  );
}

/**
 * SearchYield: durable cards first, else GET + parse + promote.
 * Process-local HTML cache still covers same-job meta/price reuse.
 */
async function loadBackMarketSearchHits(
  searchUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<BackMarketHit[]> {
  const fromEvidence = await readBackMarketSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[Back Market] Search evidence hit for ${searchUrl}`);
    return fromEvidence;
  }

  const html = await fetchBackMarketHtml(searchUrl, options);
  if (!html) return [];

  const hits = parseBackMarketSearchHits(html);
  await promoteBackMarketSearchEvidence(searchUrl, hits);
  return hits;
}

/**
 * Title search → best identity-aligned refurbished listing (cover + price +
 * grade). Same scrape feeds metadata and price refresh.
 */
export async function fetchFromBackMarket(
  query: string,
  expectedNames: string[] = [],
  options: { shelfType?: string | null; signal?: AbortSignal } = {},
): Promise<BackMarketProduct | null> {
  const cleaned = query.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const searchUrl = backmarketSearchUrl(cleaned);
  console.info(`[Back Market] Querying search: ${cleaned}`);

  const hits = await loadBackMarketSearchHits(searchUrl, options);
  if (hits.length === 0) return null;

  return pickBestHit(
    hits,
    expectedNames.length > 0 ? expectedNames : [cleaned],
    options.shelfType,
  );
}

export async function fetchFromBackMarketProductUrl(
  productUrl: string,
  expectedNames: string[] = [],
  options: { shelfType?: string | null; signal?: AbortSignal } = {},
): Promise<BackMarketProduct | null> {
  const uuid = parseBackMarketProductUuidFromUrl(productUrl);
  if (!uuid) return null;

  // Product pages share the same Nuxt payload shape for the focused listing.
  const html = await fetchBackMarketHtml(
    canonicalBackMarketProductUrl(productUrl),
    options,
  );
  if (!html) return null;

  // Search-card rows (`productPageLink`) are usually absent on PDPs — fall back
  // to the focused catalog node so pinned URLs still yield the full gallery.
  const searchHits = parseBackMarketSearchHits(html).filter(
    (hit) => parseBackMarketProductUuidFromUrl(hit.sourceUrl) === uuid,
  );
  const fromSearch = pickBestHit(
    searchHits,
    expectedNames,
    options.shelfType,
  );
  const fromPage = parseBackMarketProductPage(html, uuid);
  const best = fromSearch ?? fromPage;
  if (!best) return null;

  if (
    !fromSearch &&
    fromPage &&
    expectedNames.length > 0 &&
    !expectedNames.some((name) =>
      priceListingSharesItemIdentity(name, fromPage.title, {
        shelfType: options.shelfType,
      }),
    )
  ) {
    return null;
  }

  return withProductGallery(
    best,
    parseBackMarketProductGallery(html, uuid),
  );
}

export async function fetchPricesFromBackMarket(
  query: string,
  expectedNames: string[] = [],
  options: { shelfType?: string | null; signal?: AbortSignal } = {},
): Promise<BackMarketPrices | null> {
  const product = await fetchFromBackMarket(query, expectedNames, options);
  return product ? pricesFromHit(product) : null;
}

export async function fetchPricesFromBackMarketProductUrl(
  productUrl: string,
  expectedNames: string[] = [],
  options: { shelfType?: string | null; signal?: AbortSignal } = {},
): Promise<BackMarketPrices | null> {
  const product = await fetchFromBackMarketProductUrl(
    productUrl,
    expectedNames,
    options,
  );
  return product ? pricesFromHit(product) : null;
}

export async function pingBackMarket(): Promise<{
  ok: boolean;
  latency: number | null;
  error: string | null;
}> {
  const start = Date.now();
  try {
    const html = await fetchBackMarketHtml(backmarketSearchUrl("Wii"));
    const hits = html ? parseBackMarketSearchHits(html) : [];
    return {
      ok: hits.length > 0,
      latency: Date.now() - start,
      error: hits.length > 0 ? null : "No Back Market search hits",
    };
  } catch (error) {
    return {
      ok: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
