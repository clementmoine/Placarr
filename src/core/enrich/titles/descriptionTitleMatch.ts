import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import { EDITION_QUALIFIER } from "@/core/enrich/titles/gameEditionVariant";

/** Reject descriptions that omit a distinctive colon-subtitle (e.g. Blood Dragon). */
export function descriptionMatchesRequestedTitle(
  requestedTitle: string,
  description: string,
): boolean {
  const colonMatch = requestedTitle.match(/^[^:]+:\s*([^:]+)/);
  if (!colonMatch) return true;

  const subtitle = colonMatch[1].replace(/\s+[-–—]\s+.*$/, "").trim();
  if (EDITION_QUALIFIER.test(subtitle)) return true;

  const tokens = normalizeDisplayTitle(subtitle).filter(
    (token) =>
      token.length >= 4 &&
      !["edition", "classic", "game", "the", "sur", "star"].includes(token),
  );
  if (tokens.length === 0) return true;

  const lower = description.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}
