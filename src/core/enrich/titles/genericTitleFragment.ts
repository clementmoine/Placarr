import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import { isIdentityPlatformNoiseToken } from "@/core/enrich/titles/identityNoise";

/**
 * Detects a candidate whose title is only a *generic fragment* of the requested
 * title: a strict token-subset of one of the comparison names that drops that
 * name's leading identity token. Catches false matches such as RAWG returning
 * the itch.io game "Retour vers le passé" for "The Lapins Crétins : Retour vers
 * le passé" — it shares the generic subtitle but none of the franchise identity,
 * yet still scores above the alignment threshold via token overlap.
 *
 * Legit base titles keep the leading token and are NOT flagged ("Monopoly" for
 * "Monopoly - Editions ...", "Mario Kart" for "Mario Kart Wii", "The Legend of
 * Zelda: Skyward Sword" for the same with an edition suffix).
 */
export function isGenericTitleFragment(
  candidateTitle: string | undefined,
  comparisonNames: string[],
): boolean {
  if (!candidateTitle) return false;
  const candTokens = normalizeDisplayTitle(candidateTitle);
  if (candTokens.length === 0) return false;
  const candSet = new Set(candTokens);

  let isStrictSubsetOfSome = false;
  for (const name of comparisonNames) {
    const nameTokens = normalizeDisplayTitle(name);
    if (nameTokens.length === 0) continue;
    const nameSet = new Set(nameTokens);
    if (!candTokens.every((token) => nameSet.has(token))) continue;
    if (candTokens.length >= nameTokens.length) return false; // equal/exact → aligned
    isStrictSubsetOfSome = true;
    if (candSet.has(nameTokens[0])) return false; // keeps the leading identity token
    // Catalog keeps a platform-registry token from the request ("PlayStation 5"
    // for "Sony PlayStation 5") — brand prefixes are not generic subtitles.
    if (
      candTokens.some(
        (token) => isIdentityPlatformNoiseToken(token) && nameSet.has(token),
      )
    ) {
      return false;
    }
    // Catalog "007: Nightfire" keeps the Bond series code from a "James Bond 007…"
    // shelf title — that code is the franchise identity, not a generic subtitle.
    if (
      candTokens.some((token) => /^\d{3}$/.test(token) && nameSet.has(token))
    ) {
      return false;
    }
  }
  return isStrictSubsetOfSome;
}
