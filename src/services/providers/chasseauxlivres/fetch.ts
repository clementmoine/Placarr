import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";

export interface ChasseAuxLivresProduct {
  name: string;
  coverUrl?: string;
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
    /<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/g,
  )) {
    const coverUrl = match[1].split("?")[0];
    const name = decodeHTMLEntities(match[2].trim());
    if (name && !products.some((product) => product.name === name)) {
      products.push({ name, coverUrl });
    }
  }

  if (products.length === 0) {
    for (const match of html.matchAll(
      /<img[^>]*alt="([^"]+)"[^>]*src="([^"]+)"/g,
    )) {
      const name = decodeHTMLEntities(match[1].trim());
      const coverUrl = match[2].split("?")[0];
      if (name && !products.some((product) => product.name === name)) {
        products.push({ name, coverUrl });
      }
    }
  }

  if (products.length === 0) {
    const titleMatch = html.match(/title="([^"]+)"/);
    if (titleMatch) {
      products.push({
        name: decodeHTMLEntities(titleMatch[1]).trim(),
      });
    }
  }

  return products;
}

export async function fetchFromChasseAuxLivres(
  barcode: string,
  catalog: string,
): Promise<ChasseAuxLivresProduct[]> {
  const searchUrl = `https://www.chasse-aux-livres.fr/search?query=${barcode}&catalog=${catalog}`;
  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://www.chasse-aux-livres.fr/",
    };
    // Step 1: Fetch initial page to get the hash
    const initialRes = await axios.get(searchUrl, { headers });
    const html = initialRes.data;

    const finalUrl = initialRes.request.res.responseUrl || "";
    if (finalUrl.includes("/prix/")) {
      console.log(`[ChasseAuxLivres] Direct redirect detected: ${finalUrl}`);
      const redirPath = finalUrl.replace(/^https?:\/\/[^/]+/, "");
      const product = parseRedirProduct(redirPath);
      if (product) {
        const coverUrl =
          extractCoverFromListing(html) ||
          html
            .match(/<img[^>]*id="book-cover"[^>]*src="([^"]+)"/i)?.[1]
            ?.split("?")[0] ||
          html
            .match(/<img[^>]*class="[^"]*cover[^"]*"[^>]*src="([^"]+)"/i)?.[1]
            ?.split("?")[0];
        return [{ ...product, coverUrl }];
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
    const resultsRes = await axios.get(resultsUrl, { headers });
    const data = resultsRes.data;

    if (typeof data.redir === "string" && data.redir.trim()) {
      const product = parseRedirProduct(data.redir.trim());
      if (product) {
        const coverUrl = extractCoverFromListing(
          String(data.d || ""),
          data.redir.trim(),
        );
        return [{ ...product, coverUrl }];
      }
    }

    const products = parseListingProducts(String(data.d || ""));

    if (products.length > 0) {
      return products;
    }

    return [];
  } catch (error) {
    console.error(
      `[ChasseAuxLivres] Error fetching for barcode ${barcode}:`,
      error,
    );
    return [];
  }
}

export async function fetchPricesFromChasseAuxLivres(
  barcode: string,
): Promise<{ priceNew?: number; priceUsed?: number } | null> {
  const catalog = "fr"; // default catalog for books/movies/boardgames
  const searchUrl = `https://www.chasse-aux-livres.fr/search?query=${barcode}&catalog=${catalog}`;

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: "https://www.chasse-aux-livres.fr/",
  };

  try {
    // Step 1: Fetch initial page to get the hash and other params
    const initialRes = await axios.get(searchUrl, { headers });
    const html = initialRes.data;
    const hashMatch = html.match(/data-hash="([^"]+)"/);
    if (!hashMatch) {
      console.warn(
        `[ChasseAuxLivres] Prices lookup: Could not find data-hash for barcode ${barcode}`,
      );
      return null;
    }
    const hash = hashMatch[1];

    // Step 2: Fetch search results redirect
    const resultsUrl = `https://www.chasse-aux-livres.fr/rest/search-results?h=${hash}&p=1&l=1`;
    const resultsRes = await axios.get(resultsUrl, { headers });
    const data = resultsRes.data;

    if (!data.redir) {
      console.warn(
        `[ChasseAuxLivres] Prices lookup: No redirect URL found for barcode ${barcode}`,
      );
      return null;
    }

    const redirUrl = `https://www.chasse-aux-livres.fr${data.redir}`;

    // Fetch product detail page to extract lvs and other data attributes
    let redirRes = await axios.get(redirUrl, { headers });
    let redirHtml = redirRes.data;

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

    let params = extractParams(redirHtml);
    if (!params.asin) {
      console.warn(
        `[ChasseAuxLivres] Prices lookup: Could not parse product details for barcode ${barcode}`,
      );
      return null;
    }

    const ajaxHeaders = {
      ...headers,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: redirUrl,
    };

    let retryCount = 0;
    const maxRetries = 2;
    let offersData: any = null;

    while (retryCount <= maxRetries) {
      const engines = Array.from({ length: params.nbeng }, (_, i) => i).join(
        "_",
      );
      const lookupUrl = `https://www.chasse-aux-livres.fr/rest/lookup/results?calls=offers&itemId=${params.asin}&retry=0&duih=${params.duih}&lvs=${params.lvs}&ui=${params.ui}&engines=${engines}&f=${params.fuzz}`;

      const lookupRes = await axios.get(lookupUrl, { headers: ajaxHeaders });
      const resData = lookupRes.data;

      if (resData.relook) {
        retryCount++;
        if (retryCount <= maxRetries) {
          console.log(
            `[ChasseAuxLivres] Relook is true, waiting 2.5s and retrying (${retryCount}/${maxRetries})...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 2500));
          // Refetch product page to get new session/lvs parameters
          redirRes = await axios.get(redirUrl, { headers });
          redirHtml = redirRes.data;
          params = extractParams(redirHtml);
        } else {
          console.warn(
            `[ChasseAuxLivres] Maximum retries reached for barcode ${barcode}`,
          );
        }
      } else {
        offersData = resData.offers;
        break;
      }
    }

    if (!offersData) {
      console.warn(
        `[ChasseAuxLivres] No offers returned for barcode ${barcode}`,
      );
      return null;
    }

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
  } catch (error: any) {
    console.error(
      `[ChasseAuxLivres] Error fetching prices for barcode ${barcode}:`,
      error.message,
    );
    return null;
  }
}
