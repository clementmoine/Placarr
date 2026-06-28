import { decode as decodeHTMLEntities } from "html-entities";

import {
  formatBoardGamePlayerCount,
  normalizeBoardGamePlayerCount,
} from "@/lib/metadata/boardGame";

import type { PrestashopSearchProduct } from "./types";

export function stripHtml(value: string): string {
  return decodeHTMLEntities(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function parseFrenchPriceCents(
  priceAmount?: number,
  priceLabel?: string,
): number | undefined {
  if (priceAmount != null && Number.isFinite(priceAmount)) {
    return Math.round(priceAmount * 100);
  }

  if (!priceLabel) return undefined;
  const match = priceLabel.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(amount)) return undefined;
  return Math.round(amount * 100);
}

export function extractEditionYearFromProductName(
  name?: string,
): string | undefined {
  if (!name) return undefined;
  const trimmed = stripHtml(name);
  const parenthetical = trimmed.match(/\((\d{4})\)/);
  if (parenthetical) {
    return `${parenthetical[1]}-01-01`;
  }
  const suffix = trimmed.match(
    /\b(19\d{2}|20\d{2})\b(?!.*\b(19\d{2}|20\d{2})\b)/,
  );
  if (suffix) {
    return `${suffix[1]}-01-01`;
  }
  return undefined;
}

export function extractBarcodeFromProductUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/(?:^|[-_/])(\d{12,13})(?:\.html|$)/i);
  return match?.[1];
}

export function pickPrestashopCoverUrl(
  product: PrestashopSearchProduct,
): string | undefined {
  const bySize = product.cover?.bySize;
  let url: string | undefined;
  if (bySize) {
    for (const key of [
      "large_default",
      "home_default",
      "medium_default",
      "small_default",
    ]) {
      const candidate = bySize[key]?.url;
      if (candidate) {
        url = candidate;
        break;
      }
    }
  }
  url = url || product.cover?.large?.url;
  if (!url) return undefined;
  return url.replace(/-home_default\//, "-large_default/");
}

export function parsePrestashopShortDescription(html: string): {
  description?: string;
  players?: string;
  playtime?: string;
  ageRating?: string;
} {
  const plain = stripHtml(html);
  const result: {
    description?: string;
    players?: string;
    playtime?: string;
    ageRating?: string;
  } = {};

  const playersMatch = plain.match(
    /(?:de\s+)?(\d+)\s*(?:à|a|-)\s*(\d+)\s*joueurs?/i,
  );
  if (playersMatch) {
    result.players = formatBoardGamePlayerCount(
      playersMatch[1],
      playersMatch[2],
    );
  } else {
    const singlePlayersMatch = plain.match(/(\d+)\s*joueurs?/i);
    if (singlePlayersMatch) {
      result.players = normalizeBoardGamePlayerCount(singlePlayersMatch[1]);
    }
  }

  const ageMatch = plain.match(/(?:à partir de|des?|dès)\s*(\d+)\s*ans?/i);
  if (ageMatch) {
    result.ageRating = `${ageMatch[1]}+`;
  }

  const minutesMatch = plain.match(/(\d+)\s*minutes?/i);
  if (minutesMatch) {
    result.playtime = `${minutesMatch[1]} min`;
  } else {
    const hoursMatch = plain.match(
      /(\d+(?:[.,]\d+)?)\s*(?:à|a|-)\s*(\d+(?:[.,]\d+)?)\s*h(?:eures?)?/i,
    );
    if (hoursMatch) {
      result.playtime = `${hoursMatch[1].replace(".", ",")} à ${hoursMatch[2].replace(".", ",")}h`;
    } else {
      const singleHourMatch = plain.match(/(\d+(?:[.,]\d+)?)\s*h(?:eures?)?/i);
      if (singleHourMatch) {
        result.playtime = `${singleHourMatch[1].replace(".", ",")}h`;
      }
    }
  }

  const description = plain
    .replace(/(?:de\s+)?\d+\s*(?:à|a|-)\s*\d+\s*joueurs?\.?/gi, "")
    .replace(/(?:à partir de|des?|dès)\s*\d+\s*ans?\.?/gi, "")
    .replace(/\d+\s*minutes?\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (description.length >= 20) {
    result.description = description;
  }

  return result;
}

/** EAN / GTIN from a PrestaShop product page (JSON-LD or `data-product` reference). */
export function parsePrestashopProductPageBarcode(
  html: string,
): string | undefined {
  const gtinMatch = html.match(/"gtin13"\s*:\s*"(\d{12,13})"/i);
  if (gtinMatch) return gtinMatch[1];

  const referenceMatch = html.match(/"reference"\s*:\s*"(\d{12,13})/i);
  return referenceMatch?.[1];
}

function parseIqitMiniatureBlock(
  block: string,
): PrestashopSearchProduct | null {
  const titleLinkMatch =
    block.match(
      /<h5 class="product-name">\s*<a href="([^"]+)"[^>]*>([^<]*)</i,
    ) ||
    block.match(
      /<h3[^>]*class="[^"]*product-title[^"]*"[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]*)</i,
    );
  const coverLinkMatch = block.match(
    /<a href="([^"]+)" class="product-cover-link"/i,
  );
  const thumbnailLinkMatch = block.match(
    /<a href="([^"]+)" class="thumbnail product-thumbnail"/i,
  );

  const link =
    titleLinkMatch?.[1]?.trim() ||
    coverLinkMatch?.[1]?.trim() ||
    thumbnailLinkMatch?.[1]?.trim();
  if (!link) return null;

  const name =
    stripHtml(titleLinkMatch?.[2] || "") ||
    block.match(/<img[^>]+alt\s*=\s*"([^"]+)"/i)?.[1]?.trim();
  if (!name) return null;

  const priceLabel = block
    .match(/<span class="price(?: product-price)?"[^>]*>\s*([^<]+)/i)?.[1]
    ?.trim();
  const priceCents = parseFrenchPriceCents(undefined, priceLabel);

  const largeImage =
    block.match(/data-full-size-image-url\s*=\s*"([^"]+)"/i)?.[1] ||
    block.match(/data-image-large-src="([^"]+)"/i)?.[1];
  const thumbImage = block.match(
    /<img[^>]+src\s*=\s*"([^"]+-(?:home|large)_default[^"]+)"/i,
  )?.[1];

  const bySize: Record<string, { url?: string }> = {};
  if (largeImage) bySize.large_default = { url: largeImage };
  if (thumbImage) {
    if (thumbImage.includes("large_default")) {
      bySize.large_default = { url: thumbImage };
    } else {
      bySize.home_default = { url: thumbImage };
    }
  }

  return {
    name,
    link,
    price: priceLabel,
    price_amount: priceCents != null ? priceCents / 100 : undefined,
    cover: Object.keys(bySize).length > 0 ? { bySize } : undefined,
  };
}

/**
 * Parses IQIT / ZOne theme search fragments (`rendered_products` AJAX field).
 * Native PrestaShop exposes structured `products[]`; IQIT embeds miniatures in HTML.
 */
export function parseIqitRenderedProducts(
  renderedHtml: string,
): PrestashopSearchProduct[] {
  if (!renderedHtml.trim()) return [];

  const products: PrestashopSearchProduct[] = [];
  const seenLinks = new Set<string>();

  for (const part of renderedHtml.split(/(?=<div class="product-miniature\b)/i)) {
    if (!/class="product-miniature/i.test(part)) continue;

    const product = parseIqitMiniatureBlock(part);
    if (!product?.link || seenLinks.has(product.link)) continue;
    seenLinks.add(product.link);
    products.push(product);
  }

  return products;
}
