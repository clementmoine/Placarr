import axios from "axios";

/**
 * Smartoys (https://www.smartoys.be) is a Belgian retro-gaming retailer whose
 * product pages are keyed by barcode: `product_info.php?products_id=<barcode>`
 * 301-redirects to the canonical `…-p-<barcode>.html`. We read prices straight
 * from the product page (robots-allowed) instead of their search endpoint
 * (`advanced_search.php`, which robots.txt disallows).
 *
 * Safety: an unknown id can redirect to an *unrelated* product, so we only
 * trust a page whose canonical URL actually carries our barcode.
 */

const SMARTOYS_BASE = "https://www.smartoys.be";
const SMARTOYS_TIMEOUT_MS = 8000;
const SMARTOYS_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export interface SmartoysPrices {
  priceNew?: number; // cents
  priceUsed?: number; // cents
  productName?: string | null;
  coverUrl?: string | null;
  sourceUrl?: string | null;
}

interface SmartoysJsonLdOffer {
  price?: number | string;
  itemCondition?: string;
}

interface SmartoysJsonLdProduct {
  "@type"?: string;
  name?: string;
  image?: string | string[];
  offers?: SmartoysJsonLdOffer | SmartoysJsonLdOffer[];
}

function normalizeBarcode(value: string): string {
  return value.replace(/[^\d]/g, "").replace(/^0+/, "");
}

function extractProductJsonLd(html: string): SmartoysJsonLdProduct | null {
  const blocks = html.matchAll(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    try {
      const data = JSON.parse(block[1].trim());
      if (data && data["@type"] === "Product") {
        return data as SmartoysJsonLdProduct;
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }
  return null;
}

function newPriceCentsFromJsonLd(
  product: SmartoysJsonLdProduct,
): number | undefined {
  const offers = product.offers
    ? Array.isArray(product.offers)
      ? product.offers
      : [product.offers]
    : [];
  const newPrices = offers
    .filter((offer) => /New/i.test(String(offer.itemCondition || "")))
    .map((offer) => Number(offer.price))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (newPrices.length === 0) return undefined;
  return Math.round(Math.min(...newPrices) * 100);
}

function usedPriceCentsFromHtml(html: string): number | undefined {
  // Per-store availability rows expose the used price in cells shaped like
  // `<td width="20%">10.00&nbsp;&euro;</td>`. The cheapest is the "Prix min.".
  const amounts = [
    ...html.matchAll(
      /<td[^>]*width="20%"[^>]*>\s*(\d{1,4}(?:[.,]\d{2}))\s*(?:&nbsp;|\s)*&euro;/gi,
    ),
  ]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (amounts.length === 0) return undefined;
  return Math.round(Math.min(...amounts) * 100);
}

function firstImage(image?: string | string[]): string | null {
  if (!image) return null;
  return Array.isArray(image) ? image[0] || null : image;
}

export async function fetchPricesFromSmartoys(
  barcode: string,
): Promise<SmartoysPrices | null> {
  const cleaned = (barcode || "").replace(/[^\d]/g, "").trim();
  if (!cleaned) return null;

  const requestUrl = `${SMARTOYS_BASE}/catalog/product_info.php?products_id=${cleaned}`;
  console.info(`[Smartoys] Querying product page for barcode: ${cleaned}`);

  try {
    const res = await axios.get<string>(requestUrl, {
      headers: {
        "User-Agent": SMARTOYS_USER_AGENT,
        "Accept-Language": "fr-BE,fr;q=0.9",
      },
      timeout: SMARTOYS_TIMEOUT_MS,
      responseType: "text",
      maxRedirects: 5,
    });

    const html = typeof res.data === "string" ? res.data : "";
    if (!html) return null;

    const finalUrl: string =
      (res.request?.res?.responseUrl as string) ||
      (res.request?.responseURL as string) ||
      requestUrl;

    // The unknown-id redirect can land on an unrelated product — only trust a
    // page whose canonical URL carries our barcode.
    const urlBarcode = finalUrl.match(/-p-(\d+)\.html/i)?.[1];
    if (
      !urlBarcode ||
      normalizeBarcode(urlBarcode) !== normalizeBarcode(cleaned)
    ) {
      console.info(`[Smartoys] No product for barcode ${cleaned}`);
      return null;
    }

    const product = extractProductJsonLd(html);
    if (!product) return null;

    const priceNew = newPriceCentsFromJsonLd(product);
    const priceUsed = usedPriceCentsFromHtml(html);
    if (priceNew === undefined && priceUsed === undefined) return null;

    return {
      priceNew,
      priceUsed,
      productName: typeof product.name === "string" ? product.name : null,
      coverUrl: firstImage(product.image),
      sourceUrl: finalUrl,
    };
  } catch (error) {
    console.error(
      `[Smartoys] Price lookup failed for "${cleaned}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
