import type { LocaleLanguage } from "@/lib/locale/preference";
import { normalizeDisplayTitle } from "@/lib/title/displayScore";

/**
 * When a shelf label signals a French-market comics/books collection, metadata
 * descriptions in another language (e.g. a Spanish edition synopsis) are likely
 * the wrong hit. Returns null when the shelf name carries no locale hint.
 */
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
