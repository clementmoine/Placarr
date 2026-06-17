import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";

export interface FreakxyProduct {
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

export async function fetchFromFreakxy(
  barcode: string,
): Promise<FreakxyProduct[]> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanedBarcode) return [];

  const url = `https://www.freakxy.fr/catalogsearch/result/?q=${cleanedBarcode}`;
  console.log(`[Freakxy] Querying search: ${url}`);

  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
    const html = res.data;

    if (
      html.includes("Votre recherche n'a retourné aucun résultat") ||
      html.includes("Your search returned no results") ||
      html.includes("notice message info")
    ) {
      console.log(
        `[Freakxy] Search returned no results for barcode: ${cleanedBarcode}`,
      );
      return [];
    }

    // Matches Magento 2 product-item blocks
    const productItems = html.match(
      /<li class=\"[^\"]*product-item[^\"]*\">([\s\S]*?)<\/li>/gi,
    );
    if (!productItems) {
      console.log(
        `[Freakxy] No product items found for barcode: ${cleanedBarcode}`,
      );
      return [];
    }

    const results: FreakxyProduct[] = [];

    for (const item of productItems) {
      const titleMatch = item.match(
        /class=\"product-item-link\"[^>]*>\s*([\s\S]*?)\s*<\/a>/i,
      );
      const imgMatch =
        item.match(
          /<img[^>]*class=\"product-image-photo\"[^>]*src=\"([^\"]+)\"/i,
        ) ||
        item.match(
          /<img[^>]*src=\"([^\"]+)\"[^>]*class=\"product-image-photo\"/i,
        ) ||
        item.match(/<img[^>]*src=\"([^\"]+)\"/i);

      if (titleMatch) {
        const title = decodeHTMLEntities(titleMatch[1].trim());
        const coverUrl = imgMatch ? imgMatch[1].trim() : null;
        results.push({
          name: title,
          coverUrl,
        });
      }
    }

    return results;
  } catch (error: any) {
    console.error(
      `[Freakxy] Error querying barcode ${cleanedBarcode}:`,
      error.message,
    );
    return [];
  }
}
