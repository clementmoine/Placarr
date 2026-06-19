import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";

export interface ApriloshopProduct {
  name: string;
  coverUrl?: string | null;
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

async function validateBarcodeOnPage(
  url: string,
  targetBarcode: string,
): Promise<boolean> {
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 5000 });
    const html = res.data;

    // Look for JSON-LD Product blocks
    const jsonLdMatches =
      html.match(
        /<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/gi,
      ) ||
      html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);

    let foundProductBlock = false;
    let barcodeMatched = false;

    if (jsonLdMatches) {
      for (const block of jsonLdMatches) {
        const jsonText = block
          .replace(/<script[^>]*>/i, "")
          .replace(/<\/script>/i, "")
          .trim();
        try {
          const parsed = JSON.parse(jsonText);
          if (parsed["@type"] === "Product") {
            foundProductBlock = true;
            const fieldsToCompare = [
              parsed.gtin13,
              parsed.sku,
              parsed.mpn,
              parsed.upc,
              parsed.isbn,
              parsed.offers?.sku,
              parsed.offers?.mpn,
              parsed.offers?.gtin13,
            ];

            for (const field of fieldsToCompare) {
              if (field) {
                const cleanedField = String(field).replace(/[^\d]/g, "").trim();
                if (
                  cleanedField === targetBarcode ||
                  cleanedField.includes(targetBarcode) ||
                  targetBarcode.includes(cleanedField)
                ) {
                  barcodeMatched = true;
                  break;
                }
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (foundProductBlock) {
      return barcodeMatched;
    }

    // Fallback: Check if URL or page HTML contains the barcode
    const cleanedUrl = url.toLowerCase();
    if (cleanedUrl.includes(targetBarcode)) {
      return true;
    }
    if (html.includes(targetBarcode)) {
      return true;
    }

    return false;
  } catch (error: any) {
    console.warn(
      `[Apriloshop Validation] Error fetching page ${url}:`,
      error.message,
    );
    // On failure/timeout, default to true to avoid discarding valid results due to network issues
    return true;
  }
}

export async function fetchFromApriloshop(
  barcode: string,
): Promise<ApriloshopProduct[]> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanedBarcode) return [];

  const url = `https://apriloshop.fr/recherche?s=${cleanedBarcode}`;
  console.log(`[Apriloshop] Querying search: ${url}`);

  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const html = res.data;

    if (
      html.includes('id="product-search-no-matches"') ||
      html.includes("Aucun produit ne correspond à votre recherche")
    ) {
      console.log(
        `[Apriloshop] No matches found for barcode ${cleanedBarcode} (empty search indicator detected)`,
      );
      return [];
    }

    // 1. Extract JSON-LD ItemList targets
    const jsonLdUrls: { name: string; url: string }[] = [];
    const jsonLdMatches = html.match(
      /<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/gi,
    );
    if (jsonLdMatches) {
      for (const block of jsonLdMatches) {
        const jsonText = block
          .replace(/<script[^>]*>/i, "")
          .replace(/<\/script>/i, "")
          .trim();
        try {
          const parsed = JSON.parse(jsonText);
          if (parsed["@type"] === "ItemList" && parsed.itemListElement) {
            for (const item of parsed.itemListElement) {
              if (item.url) {
                jsonLdUrls.push({
                  name: item.name,
                  url: item.url,
                });
              }
            }
          }
        } catch (e) {
          // Ignore parse errors on other script blocks
        }
      }
    }

    // 2. Parse all miniature components
    const miniatures: { url: string; image: string; name: string }[] = [];
    const regex =
      /<(article|div)[^>]*class=\"[^\"]*product-miniature[^\"]*\"[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const content = match[2];
      const linkMatch =
        content.match(/href=\"([^\"]+)\"[^>]*class=\"product-cover-link\"/i) ||
        content.match(/class=\"product-cover-link\"[^>]*href=\"([^\"]+)\"/i);
      const imgMatch =
        content.match(/<picture>[\s\S]*?<img[^>]*src\s*=\s*\"([^\"]+)\"/i) ||
        content.match(/<img[^>]*src\s*=\s*\"([^\"]+)\"/i);
      const titleMatch = content.match(
        /class=\"product-(?:name|title)\"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
      );

      if (linkMatch && imgMatch) {
        miniatures.push({
          url: linkMatch[1],
          image: imgMatch[1],
          name: titleMatch
            ? titleMatch[1]
                .replace(/<[^>]+>/g, "")
                .replace(/\s+/g, " ")
                .trim()
            : "",
        });
      }
    }

    const results: ApriloshopProduct[] = [];

    // Compile list of unique candidates
    const candidates: { name: string; url: string; image?: string | null }[] =
      [];
    if (jsonLdUrls.length > 0) {
      for (const target of jsonLdUrls) {
        const min = miniatures.find((m) => m.url === target.url);
        candidates.push({
          name: target.name,
          url: target.url,
          image: min ? min.image : null,
        });
      }
    } else {
      for (const min of miniatures) {
        candidates.push({
          name: min.name,
          url: min.url,
          image: min.image,
        });
      }
    }

    const uniqueCandidates = candidates.filter(
      (cand, idx, self) => self.findIndex((c) => c.url === cand.url) === idx,
    );

    // Validate candidates (limit to first 3)
    for (const cand of uniqueCandidates.slice(0, 3)) {
      if (cand.url) {
        const isValid = await validateBarcodeOnPage(cand.url, cleanedBarcode);
        if (!isValid) {
          console.log(
            `[Apriloshop] Discarding fuzzy match: "${cand.name}" (URL: ${cand.url})`,
          );
          continue;
        }
      }

      const highResImage = cand.image
        ? cand.image.replace("-home_default", "-large_default")
        : null;

      results.push({
        name: decodeHTMLEntities(cand.name.trim()),
        coverUrl: highResImage,
      });
    }

    return results;
  } catch (error: any) {
    console.error(
      `[Apriloshop] Error querying barcode ${cleanedBarcode}:`,
      error.message,
    );
    return [];
  }
}
