import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";

export interface PicClickProduct {
  name: string;
  coverUrl?: string | null;
}

export interface PicClickPrices {
  priceUsed?: number;
  sourceUrl?: string;
  productName?: string;
  offerCount?: number;
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

function parseEuroPriceCents(value: string) {
  const match = value.match(/(?:EUR|€)\s*([\d\s.,]+)/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100)
    : null;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function titleTokens(value: string) {
  const ignored = new Set([
    "blu",
    "bluray",
    "coffret",
    "collection",
    "complete",
    "disc",
    "dvd",
    "edition",
    "film",
    "integrale",
    "neuf",
    "occasion",
    "saison",
    "season",
    "vol",
    "volume",
  ]);
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        (token.length >= 3 || /^\d+$/.test(token)) && !ignored.has(token),
    );
}

function seasonNumbers(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return Array.from(normalized.matchAll(/\b(?:saison|season)\s*(\d{1,2})\b/g))
    .map((match) => match[1])
    .filter(Boolean);
}

function matchesExpectedTitle(title: string, expectedNames: string[]) {
  const expectedSeasons = new Set(expectedNames.flatMap(seasonNumbers));
  if (expectedSeasons.size > 0) {
    const titleSeasons = seasonNumbers(title);
    if (
      titleSeasons.length > 0 &&
      !titleSeasons.some((season) => expectedSeasons.has(season))
    ) {
      return false;
    }
  }

  const expectedTokens = Array.from(
    new Set(expectedNames.flatMap(titleTokens)),
  );
  if (expectedTokens.length === 0) return expectedNames.length === 0;

  const normalizedTitle = titleTokens(title);
  const titleSet = new Set(normalizedTitle);
  const expectedTextTokens = expectedTokens.filter(
    (token) => !/^\d+$/.test(token),
  );
  if (
    expectedTextTokens.length > 0 &&
    !expectedTextTokens.some((token) => titleSet.has(token))
  ) {
    return false;
  }

  const hits = expectedTokens.filter((token) => titleSet.has(token)).length;
  return hits >= Math.min(2, expectedTokens.length);
}

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

export async function fetchPricesFromPicClick(
  query: string,
  expectedNames: string[] = [],
): Promise<PicClickPrices | null> {
  const cleanedQuery = query.trim();
  if (!cleanedQuery) return null;

  const url = `https://picclick.fr/?q=${encodeURIComponent(cleanedQuery)}`;
  console.log(`[PicClick Prices] Querying search: ${url}`);

  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 6000 });
    const html = res.data;
    const itemRegex = /<li id="item-[\s\S]*?<\/li>/g;
    const prices: number[] = [];
    let firstTitle: string | null = null;
    let firstHref: string | null = null;
    let match;

    while ((match = itemRegex.exec(html)) !== null && prices.length < 12) {
      const itemHtml = match[0];
      const title =
        itemHtml.match(/<h3[^>]*title="([^"]+)"/i)?.[1] ||
        itemHtml.match(/<img[^>]*title="([^"]+)"/i)?.[1] ||
        "";
      const cleanTitle = decodeHTMLEntities(title.trim());
      if (!cleanTitle || !matchesExpectedTitle(cleanTitle, expectedNames)) {
        continue;
      }

      const priceText = itemHtml
        .match(/<div class="price">([\s\S]*?)<\/div>/i)?.[1]
        ?.replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!priceText) continue;

      const price = parseEuroPriceCents(priceText);
      if (!price) continue;

      const href = itemHtml.match(/<a href="([^"]+)"/i)?.[1] || null;
      prices.push(price);
      firstTitle = firstTitle || cleanTitle;
      firstHref = firstHref || href;
    }

    const priceUsed = median(prices);
    if (!priceUsed) return null;

    return {
      priceUsed,
      productName: firstTitle || undefined,
      sourceUrl: firstHref
        ? firstHref.startsWith("http")
          ? firstHref
          : `https://picclick.fr${firstHref}`
        : url,
      offerCount: prices.length,
    };
  } catch (error: any) {
    console.error(
      `[PicClick Prices] Error querying ${cleanedQuery}:`,
      error.message,
    );
    return null;
  }
}
