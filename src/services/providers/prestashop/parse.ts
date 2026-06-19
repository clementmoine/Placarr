import { decode as decodeHTMLEntities } from "html-entities";

import {
  formatBoardGamePlayerCount,
  normalizeBoardGamePlayerCount,
} from "@/lib/boardGamePlayers";

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
  if (bySize) {
    for (const key of [
      "home_default",
      "large_default",
      "medium_default",
      "small_default",
    ]) {
      const url = bySize[key]?.url;
      if (url) return url;
    }
  }
  return product.cover?.large?.url;
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
