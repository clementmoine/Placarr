/**
 * Shelf-label locale hints for metadata language preference.
 */
import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import type { LocaleLanguage } from "@/core/locale/preference";

export function preferredMetadataLanguagesFromShelfName(
  shelfName?: string | null,
): LocaleLanguage[] | null {
  const tokens = normalizeDisplayTitle(shelfName ?? "");
  if (tokens.length === 0) return null;

  const frMarketHints = new Set([
    "manga",
    "mangas",
    "livre",
    "livres",
    "bd",
    "bde",
    "bédé",
    "bede",
    "bande",
    "comic",
    "comics",
    "roman",
    "romans",
    "album",
    "albums",
  ]);

  if (
    tokens.some(
      (token) =>
        frMarketHints.has(token) ||
        token.startsWith("béd") ||
        token.startsWith("bede"),
    )
  ) {
    return ["fr"];
  }

  return null;
}
