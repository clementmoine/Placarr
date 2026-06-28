import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";
import { normalizeProductBarcode } from "@/lib/barcode/normalize";

export interface ChasseAuxLivresProduct {
  name: string;
  coverUrl?: string;
  productUrl?: string;
  sku?: string;
  barcode?: string | null;
  description?: string;
  authors?: string[];
  publisher?: string;
  category?: string;
  ratingValue?: number;
  ratingCount?: number;
  priceNew?: number; // cents, only when a single product is resolved
  priceUsed?: number; // cents, only when a single product is resolved
}

type ChasseProductValidator = (product: ChasseAuxLivresProduct) => boolean;

const CHASSE_AUX_LIVRES_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://www.chasse-aux-livres.fr/",
};
const CHASSE_AUX_LIVRES_TIMEOUT_MS = 8_000;

function describeChasseError(error: unknown): string {
  const requestError = error as {
    response?: { status?: number };
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };
  const status = requestError.response?.status;
  if (typeof status === "number") return `HTTP ${status}`;
  const code = requestError.code || requestError.cause?.code;
  const message = error instanceof Error ? error.message : requestError.message;
  return [code, message].filter(Boolean).join(" - ") || "unknown error";
}

function buildSearchUrl(barcode: string, catalog: string): string {
  return `https://www.chasse-aux-livres.fr/search?query=${encodeURIComponent(barcode)}&catalog=${encodeURIComponent(catalog)}`;
}

function absoluteChasseUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `https://www.chasse-aux-livres.fr${value}`;
  return `https://www.chasse-aux-livres.fr/${value}`;
}

function chasseProductUrlFromQuery(query: string): string | null {
  try {
    const url = new URL(query);
    if (!/(^|\.)chasse-aux-livres\.fr$/i.test(url.hostname)) return null;
    if (!url.pathname.includes("/prix/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function cleanText(value?: string | null): string | undefined {
  const text = decodeHTMLEntities(String(value || ""))
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function isProtectedLoginPage(html: string, finalUrl = ""): boolean {
  return (
    finalUrl.includes("/login?protect=true") ||
    /<title[^>]*>\s*Connexion\s+-\s+Chasse aux livres/i.test(html)
  );
}

function parseRedirProduct(redir: string): ChasseAuxLivresProduct | null {
  const parts = redir.split("?")[0].split("/");
  const slug = parts[parts.length - 1];
  if (!slug) return null;

  const title = decodeHTMLEntities(
    slug
      .split("-")
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
  ).trim();

  return title ? { name: title } : null;
}

function parseJsonLdBlocks(html: string): any[] {
  const blocks: any[] = [];
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(decodeHTMLEntities(match[1].trim()));
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else if (parsed && typeof parsed === "object") blocks.push(parsed);
    } catch {
      // Ignore malformed schema snippets.
    }
  }
  return blocks;
}

function schemaTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

function firstSchemaValue(value: unknown): string | undefined {
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = firstSchemaValue(item);
      if (parsed) return parsed;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return firstSchemaValue(record.name || record.value || record.text);
  }
  return undefined;
}

function schemaNames(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw
    .map(firstSchemaValue)
    .filter((item): item is string => Boolean(item));
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanText(String(value || ""));
  if (!text) return undefined;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function metaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const propertyFirst = html.match(
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
  );
  if (propertyFirst?.[1]) return cleanText(propertyFirst[1]);

  const contentFirst = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  );
  return cleanText(contentFirst?.[1]);
}

function parsePublisherFromHtml(html: string): string | undefined {
  const biblioMatch = html.match(
    /<div[^>]*id=["']biblio-lines["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
  );
  const text = cleanText(biblioMatch?.[1]?.replace(/<[^>]+>/g, " "));
  const publisher = text?.match(/\bParu chez\s+(.+?)(?:\s+-|$)/i)?.[1];
  return cleanText(publisher);
}

export function parseChasseAuxLivresProductPage(
  html: string,
  productUrl?: string,
): ChasseAuxLivresProduct | null {
  const schemas = parseJsonLdBlocks(html);
  const productSchema = schemas.find((schema) => {
    const types = schemaTypes(schema?.["@type"]).map((type) =>
      type.toLowerCase(),
    );
    return types.includes("product") || types.includes("book");
  });

  const name =
    firstSchemaValue(productSchema?.name) ||
    metaContent(html, "og:title") ||
    html
      .match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
      ?.replace(/\s+-\s+les Prix.*$/i, "");
  const cleanName = cleanText(name);
  if (!cleanName) return null;

  const image =
    firstSchemaValue(productSchema?.image) ||
    metaContent(html, "og:image") ||
    metaContent(html, "twitter:image") ||
    html.match(/<img[^>]*id=["']book-cover["'][^>]*src=["']([^"']+)["']/i)?.[1];
  const aggregateRating = productSchema?.aggregateRating;
  const sku =
    firstSchemaValue(productSchema?.sku) ||
    productUrl?.match(/\/prix\/([^/]+)/)?.[1];
  const barcode =
    normalizeProductBarcode(firstSchemaValue(productSchema?.isbn)) ||
    normalizeProductBarcode(firstSchemaValue(productSchema?.gtin13)) ||
    normalizeProductBarcode(
      html.match(/\b(?:EAN|ISBN(?:-13)?)\D{0,24}(\d[\d\s-]{10,20}\d)/i)?.[1],
    );

  return {
    name: cleanName,
    coverUrl: absoluteChasseUrl(image?.split("?")[0]),
    productUrl,
    sku: cleanText(sku),
    barcode,
    description:
      firstSchemaValue(productSchema?.description) ||
      metaContent(html, "description") ||
      metaContent(html, "og:description"),
    authors: schemaNames(productSchema?.author),
    publisher:
      firstSchemaValue(productSchema?.publisher) ||
      parsePublisherFromHtml(html),
    category: firstSchemaValue(productSchema?.category),
    ratingValue: parseNumber(aggregateRating?.ratingValue),
    ratingCount: parseNumber(aggregateRating?.ratingCount),
  };
}

function extractCoverFromListing(
  html: string,
  redir?: string,
): string | undefined {
  if (!html) return undefined;

  if (redir) {
    const hrefPattern = redir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const linkedImg = html.match(
      new RegExp(
        `<a[^>]*href="${hrefPattern}"[^>]*>[\\s\\S]*?<img[^>]*src="([^"]+)"`,
        "i",
      ),
    );
    if (linkedImg?.[1]) {
      return linkedImg[1].split("?")[0];
    }
  }

  const srcAlt = html.match(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/i);
  if (srcAlt?.[1]) return srcAlt[1].split("?")[0];

  const altSrc = html.match(/<img[^>]*alt="([^"]+)"[^>]*src="([^"]+)"/i);
  if (altSrc?.[2]) return altSrc[2].split("?")[0];

  return undefined;
}

function parseListingProducts(html: string): ChasseAuxLivresProduct[] {
  const products: ChasseAuxLivresProduct[] = [];

  for (const match of html.matchAll(
    /<a[^>]*href="([^"]*\/prix\/[^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/gi,
  )) {
    const name = cleanText(match[3]);
    if (name && !products.some((product) => product.name === name)) {
      products.push({
        name,
        productUrl: absoluteChasseUrl(match[1]),
        coverUrl: absoluteChasseUrl(match[2].split("?")[0]),
      });
    }
  }

  for (const match of html.matchAll(
    /<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/gi,
  )) {
    const coverUrl = absoluteChasseUrl(match[1].split("?")[0]);
    const name = cleanText(match[2]);
    if (name && !products.some((product) => product.name === name)) {
      products.push({ name, coverUrl });
    }
  }

  if (products.length === 0) {
    for (const match of html.matchAll(
      /<img[^>]*alt="([^"]+)"[^>]*src="([^"]+)"/gi,
    )) {
      const name = cleanText(match[1]);
      const coverUrl = absoluteChasseUrl(match[2].split("?")[0]);
      if (name && !products.some((product) => product.name === name)) {
        products.push({ name, coverUrl });
      }
    }
  }

  if (products.length === 0) {
    const titleMatch = html.match(/title="([^"]+)"/);
    if (titleMatch) {
      const name = cleanText(titleMatch[1]);
      products.push({
        name: name || titleMatch[1].trim(),
      });
    }
  }

  return products;
}

function uniqueProductUrls(products: ChasseAuxLivresProduct[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    const url = absoluteChasseUrl(product.productUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function searchResultCandidates(data: any): string[] {
  return uniqueProductUrls([
    ...(typeof data?.redir === "string" && data.redir.trim()
      ? [{ name: "", productUrl: data.redir.trim() }]
      : []),
    ...parseListingProducts(String(data?.d || "")),
  ]);
}

async function fetchSearchResults(hash: string, limit: number): Promise<any> {
  const resultsUrl = `https://www.chasse-aux-livres.fr/rest/search-results?h=${hash}&p=1&l=${limit}`;
  const resultsRes = await axios.get(resultsUrl, {
    headers: CHASSE_AUX_LIVRES_HEADERS,
    timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
  });
  return resultsRes.data;
}

async function fetchProductPage(
  productUrl: string,
): Promise<{
  url: string;
  html: string;
  product: ChasseAuxLivresProduct;
} | null> {
  const productRes = await axios.get(productUrl, {
    headers: CHASSE_AUX_LIVRES_HEADERS,
    responseType: "text",
    transformResponse: [(body) => body],
    timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
  });
  const html = String(productRes.data || "");
  const finalUrl = productRes.request?.res?.responseUrl || productUrl;
  if (isProtectedLoginPage(html, finalUrl)) return null;
  const product = parseChasseAuxLivresProductPage(html, finalUrl);
  return product ? { url: finalUrl, html, product } : null;
}

async function resolveChasseAuxLivresProductPage(
  query: string,
  catalog: string,
  validateProduct?: ChasseProductValidator,
): Promise<{
  url: string;
  html: string;
  product?: ChasseAuxLivresProduct;
} | null> {
  const directProductUrl = chasseProductUrlFromQuery(query);
  if (directProductUrl) {
    const page = await fetchProductPage(directProductUrl);
    if (!page) return null;
    if (validateProduct && !validateProduct(page.product)) return null;
    return page;
  }

  const searchUrl = buildSearchUrl(query, catalog);
  const initialRes = await axios.get(searchUrl, {
    headers: CHASSE_AUX_LIVRES_HEADERS,
    responseType: "text",
    transformResponse: [(data) => data],
    timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
  });
  const html = String(initialRes.data || "");
  const finalUrl = initialRes.request?.res?.responseUrl || "";
  if (isProtectedLoginPage(html, finalUrl)) return null;

  if (finalUrl.includes("/prix/")) {
    const product = parseChasseAuxLivresProductPage(html, finalUrl);
    if (validateProduct && product && !validateProduct(product)) return null;
    return { url: finalUrl, html, product: product || undefined };
  }

  const hashMatch = html.match(/data-hash="([^"]+)"/);
  if (!hashMatch) return null;

  const candidateUrls: string[] = [];
  for (const limit of [8, 1]) {
    let data: any;
    try {
      data = await fetchSearchResults(hashMatch[1], limit);
    } catch (error) {
      if (limit === 1) throw error;
      continue;
    }
    for (const url of searchResultCandidates(data)) {
      if (!candidateUrls.includes(url)) candidateUrls.push(url);
    }
    if (candidateUrls.length > 1 || limit === 1) break;
  }

  for (const productUrl of candidateUrls) {
    const page = await fetchProductPage(productUrl);
    if (!page) continue;
    if (!validateProduct || validateProduct(page.product)) return page;
  }

  return null;
}

export async function fetchChasseAuxLivresMetadataProduct(
  query: string,
  catalog = "fr",
  options: { validateProduct?: ChasseProductValidator } = {},
): Promise<ChasseAuxLivresProduct | null> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return null;

  try {
    const page = await resolveChasseAuxLivresProductPage(
      trimmedQuery,
      catalog,
      options.validateProduct,
    );
    if (!page) return null;
    return page.product || parseChasseAuxLivresProductPage(page.html, page.url);
  } catch (error) {
    console.warn(
      `[ChasseAuxLivres] Metadata lookup failed for query ${trimmedQuery}: ${describeChasseError(error)}`,
    );
    return null;
  }
}

export async function fetchFromChasseAuxLivres(
  barcode: string,
  catalog: string,
  opts: { withPrices?: boolean } = {},
): Promise<ChasseAuxLivresProduct[]> {
  const searchUrl = buildSearchUrl(barcode, catalog);
  try {
    // Step 1: Fetch initial page to get the hash
    const initialRes = await axios.get(searchUrl, {
      headers: CHASSE_AUX_LIVRES_HEADERS,
      timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
    });
    const html = initialRes.data;

    const finalUrl = initialRes.request.res.responseUrl || "";
    if (isProtectedLoginPage(html, finalUrl)) {
      console.warn(
        `[ChasseAuxLivres] Search is protected by login for barcode ${barcode}`,
      );
      return [];
    }

    if (finalUrl.includes("/prix/")) {
      console.log(`[ChasseAuxLivres] Direct redirect detected: ${finalUrl}`);
      const redirPath = finalUrl.replace(/^https?:\/\/[^/]+/, "");
      const product =
        parseChasseAuxLivresProductPage(html, finalUrl) ||
        parseRedirProduct(redirPath);
      if (product) {
        const coverUrl =
          product.coverUrl ||
          extractCoverFromListing(html) ||
          html
            .match(/<img[^>]*id="book-cover"[^>]*src="([^"]+)"/i)?.[1]
            ?.split("?")[0] ||
          html
            .match(/<img[^>]*class="[^"]*cover[^"]*"[^>]*src="([^"]+)"/i)?.[1]
            ?.split("?")[0];
        // Single product resolved: capture its prices in the same pass.
        const prices = opts.withPrices
          ? await fetchChasseAuxLivresOffers(finalUrl, html)
          : null;
        return [
          {
            ...product,
            coverUrl: absoluteChasseUrl(coverUrl),
            productUrl: product.productUrl || finalUrl,
            ...(prices ?? {}),
          },
        ];
      }
    }

    const hashMatch = html.match(/data-hash="([^"]+)"/);
    if (!hashMatch) {
      console.warn(
        `[ChasseAuxLivres] Could not find data-hash in response HTML for barcode ${barcode}`,
      );
      return [];
    }
    const hash = hashMatch[1];

    // Step 2: Fetch search results
    const resultsUrl = `https://www.chasse-aux-livres.fr/rest/search-results?h=${hash}&p=1&l=1`;
    const resultsRes = await axios.get(resultsUrl, {
      headers: CHASSE_AUX_LIVRES_HEADERS,
      timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
    });
    const data = resultsRes.data;

    if (typeof data.redir === "string" && data.redir.trim()) {
      const product = parseRedirProduct(data.redir.trim());
      if (product) {
        const coverUrl = extractCoverFromListing(
          String(data.d || ""),
          data.redir.trim(),
        );
        const productUrl = absoluteChasseUrl(data.redir.trim());
        // Single product resolved: capture its prices in the same pass.
        const prices = opts.withPrices
          ? await fetchChasseAuxLivresOffers(
              productUrl ||
                `https://www.chasse-aux-livres.fr${data.redir.trim()}`,
            )
          : null;
        return [
          {
            ...product,
            productUrl,
            coverUrl: absoluteChasseUrl(coverUrl),
            ...(prices ?? {}),
          },
        ];
      }
    }

    const products = parseListingProducts(String(data.d || ""));

    if (products.length > 0) {
      return products;
    }

    return [];
  } catch (error) {
    console.warn(
      `[ChasseAuxLivres] Barcode lookup failed for ${barcode}: ${describeChasseError(error)}`,
    );
    return [];
  }
}

export async function isChasseAuxLivresSearchProtected(
  barcode: string,
  catalog: string,
): Promise<boolean> {
  try {
    const response = await axios.get(buildSearchUrl(barcode, catalog), {
      headers: CHASSE_AUX_LIVRES_HEADERS,
      timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
    });
    const finalUrl = response.request.res.responseUrl || "";
    return isProtectedLoginPage(String(response.data || ""), finalUrl);
  } catch {
    return false;
  }
}

/**
 * Continue from a resolved product page to its marketplace offers and return the
 * cheapest new/used prices (cents). Shared by the dedicated price fetch and the
 * scan-time combined lookup so a single product resolution serves both.
 */
async function fetchChasseAuxLivresOffers(
  redirUrl: string,
  prefetchedHtml?: string,
): Promise<{ priceNew?: number; priceUsed?: number } | null> {
  const extractParams = (htmlContent: string) => {
    const htmlTagMatch = htmlContent.match(/<html[^>]*>/i);
    const htmlTag = htmlTagMatch ? htmlTagMatch[0] : "";
    const duihMatch = htmlTag.match(/data-duih="([^"]*)"/);
    const duih = duihMatch ? duihMatch[1] : "";

    const bookDetailsMatch = htmlContent.match(
      /<[^>]*id="book-details"[^>]*>/i,
    );
    const bookDetails = bookDetailsMatch ? bookDetailsMatch[0] : "";
    const asinMatch = bookDetails.match(/data-asin="([^"]*)"/);
    const asin = asinMatch ? asinMatch[1] : "";

    const lvsMatch = htmlContent.match(/data-lvs="([^"]*)"/);
    const lvs = lvsMatch ? lvsMatch[1] : "";

    const fuzzMatch = bookDetails.match(/data-fuzz="([^"]*)"/);
    const fuzz = fuzzMatch ? fuzzMatch[1] : "false";

    const offersMatch = htmlContent.match(/<[^>]*id="offers"[^>]*>/i);
    const offers = offersMatch ? offersMatch[0] : "";
    const nbengMatch = offers.match(/data-nbeng="([^"]*)"/);
    const nbeng = nbengMatch ? parseInt(nbengMatch[1], 10) : 0;

    const linkMatch = htmlContent.match(/<[^>]*id="d-tp-lnk"[^>]*>/i);
    const link = linkMatch ? linkMatch[0] : "";
    const uiMatch = link.match(/data-ui="([^"]*)"/);
    const ui = uiMatch ? uiMatch[1] : "";

    return { asin, duih, lvs, fuzz, nbeng, ui };
  };

  try {
    let redirHtml =
      prefetchedHtml ??
      (
        await axios.get(redirUrl, {
          headers: CHASSE_AUX_LIVRES_HEADERS,
          timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
        })
      ).data;

    let params = extractParams(redirHtml);
    if (!params.asin) {
      console.warn(
        `[ChasseAuxLivres] Prices lookup: could not parse product details at ${redirUrl}`,
      );
      return null;
    }

    const ajaxHeaders = {
      ...CHASSE_AUX_LIVRES_HEADERS,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: redirUrl,
    };

    let retryCount = 0;
    const maxRetries = 2;
    let offersData: Record<string, unknown> | null = null;

    while (retryCount <= maxRetries) {
      const engines = Array.from({ length: params.nbeng }, (_, i) => i).join(
        "_",
      );
      const lookupUrl = `https://www.chasse-aux-livres.fr/rest/lookup/results?calls=offers&itemId=${params.asin}&retry=0&duih=${params.duih}&lvs=${params.lvs}&ui=${params.ui}&engines=${engines}&f=${params.fuzz}`;

      const lookupRes = await axios.get(lookupUrl, {
        headers: ajaxHeaders,
        timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
      });
      const resData = lookupRes.data;

      if (resData.relook) {
        retryCount++;
        if (retryCount <= maxRetries) {
          console.log(
            `[ChasseAuxLivres] Relook is true, waiting 2.5s and retrying (${retryCount}/${maxRetries})...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 2500));
          // Refetch product page to get new session/lvs parameters
          redirHtml = (
            await axios.get(redirUrl, {
              headers: CHASSE_AUX_LIVRES_HEADERS,
              timeout: CHASSE_AUX_LIVRES_TIMEOUT_MS,
            })
          ).data;
          params = extractParams(redirHtml);
        } else {
          console.warn(
            `[ChasseAuxLivres] Maximum retries reached at ${redirUrl}`,
          );
        }
      } else {
        offersData = resData.offers;
        break;
      }
    }

    if (!offersData) return null;

    let minNew = Infinity;
    let minUsed = Infinity;

    for (const engineOffers of Object.values(offersData)) {
      if (!Array.isArray(engineOffers)) continue;
      for (const offer of engineOffers) {
        const cond = offer.condition ? offer.condition._name : null;
        const amt = offer.price ? offer.price.amount : null;
        if (typeof amt === "number") {
          if (cond === "NEW") {
            if (amt < minNew) minNew = amt;
          } else if (cond === "USED") {
            if (amt < minUsed) minUsed = amt;
          }
        }
      }
    }

    const result: { priceNew?: number; priceUsed?: number } = {};
    if (minNew !== Infinity) result.priceNew = minNew;
    if (minUsed !== Infinity) result.priceUsed = minUsed;

    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    console.warn(
      `[ChasseAuxLivres] Offers lookup failed at ${redirUrl}: ${describeChasseError(error)}`,
    );
    return null;
  }
}

export async function fetchPricesFromChasseAuxLivres(
  query: string,
  catalog = "fr",
  options: { validateProduct?: ChasseProductValidator } = {},
): Promise<{ priceNew?: number; priceUsed?: number } | null> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return null;

  try {
    const page = await resolveChasseAuxLivresProductPage(
      trimmedQuery,
      catalog,
      options.validateProduct,
    );
    if (!page) return null;
    return fetchChasseAuxLivresOffers(page.url, page.html);
  } catch (error) {
    console.warn(
      `[ChasseAuxLivres] Prices lookup failed for query ${trimmedQuery}: ${describeChasseError(error)}`,
    );
    return null;
  }
}
