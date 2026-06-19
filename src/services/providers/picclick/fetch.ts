import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";

export interface PicClickProduct {
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

export async function fetchFromPicClick(
  barcode: string,
): Promise<PicClickProduct[]> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanedBarcode) return [];

  const url = `https://picclick.fr/?q=${cleanedBarcode}`;
  console.log(`[PicClick] Querying barcode search: ${url}`);

  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 6000 });
    const html = res.data;

    // Check if the query yielded results by inspecting matches in item list structures
    // PicClick items have structure: <li id="item-\d+">...<img src="..." title="..." />
    const regex =
      /<li id="item-\d+">[\s\S]*?<img src="([^"]+)"[^>]*title="([^"]+)"/gi;
    const results: PicClickProduct[] = [];
    let match;
    let count = 0;

    while ((match = regex.exec(html)) !== null && count < 10) {
      let coverUrl = match[1].trim();
      if (coverUrl.startsWith("//")) {
        coverUrl = "https:" + coverUrl;
      }
      const title = decodeHTMLEntities(match[2].trim());
      if (
        title &&
        !results.some((r) => r.name.toLowerCase() === title.toLowerCase())
      ) {
        results.push({
          name: title,
          coverUrl: coverUrl,
        });
        count++;
      }
    }

    return results;
  } catch (error: any) {
    console.error(
      `[PicClick] Error querying barcode ${cleanedBarcode}:`,
      error.message,
    );
    return [];
  }
}
