/**
 * PriceCharting seek / accept helpers: order queries and validate hits against
 * the full MatchContext title bag (aliases included) — never accept a hit that
 * only matches a weak/outlier query while better titles in the bag disagree.
 */

import { franchiseSequelNumbersConflict } from "@/core/enrich/titleMatching";
import { residualIdentityMatch } from "@/core/enrich/titles/residualIdentity";

function normalizeTitleTokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Keep franchise compounds aligned: Spider-Man ↔ Spiderman.
    .replace(/-/g, "")
    // FR console capacity units ≡ PriceCharting EN (250Go ≡ 250GB).
    .replace(/\b(\d+)\s*(go|gb)\b/g, "$1gb")
    .replace(/\b(\d+)\s*(to|tb)\b/g, "$1tb")
    .replace(/\b(\d+)\s*(mo|mb)\b/g, "$1mb")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

/** Token count ≈ how specific a seek title is (bare franchise vs full edition). */
export function priceChartingSeekTitleSpecificity(title: string): number {
  return normalizeTitleTokens(title).length;
}

/** Leading token run shared by two titles (franchise stem). */
export function sharedLeadingTitleTokens(a: string, b: string): string[] {
  const tokensA = normalizeTitleTokens(a);
  const tokensB = normalizeTitleTokens(b);
  const shared: string[] = [];
  for (let i = 0; i < Math.min(tokensA.length, tokensB.length); i += 1) {
    if (tokensA[i] !== tokensB[i]) break;
    shared.push(tokensA[i]);
  }
  return shared;
}

/**
 * True when `catalog` is exactly the leading franchise stem of `title`
 * (PriceCharting often omits regional subtitles: "Baten Kaitos" vs
 * "… Eternal Wings and the Lost Ocean").
 */
export function catalogIsLeadingFranchiseStem(
  catalog: string,
  title: string,
): boolean {
  const catalogTokens = normalizeTitleTokens(catalog);
  if (catalogTokens.length < 2) return false;
  const titleTokens = normalizeTitleTokens(title);
  if (titleTokens.length <= catalogTokens.length) return false;
  return catalogTokens.every((token, index) => titleTokens[index] === token);
}

/**
 * True when every catalog token appears in `title` (order-independent).
 * Used for short PC catalog forms that skip a franchise lead
 * ("007 Nightfire" ⊂ "James Bond 007 Nightfire").
 */
export function catalogIsTokenSubsetOfTitle(
  catalog: string,
  title: string,
): boolean {
  const catalogTokens = normalizeTitleTokens(catalog);
  if (catalogTokens.length < 2) return false;
  const titleTokenSet = new Set(normalizeTitleTokens(title));
  return catalogTokens.every((token) => titleTokenSet.has(token));
}

/**
 * Soft family affinity (shared tokens). Uses Jaccard over the union so a short
 * franchise label cannot score higher than a full regional title.
 * Leading franchise stems also count for long↔long regional pairs
 * (FR↔EN subtitles) — Jaccard alone drops "Eternal Wings…" against
 * "Les Ailes éternelles…". Bare franchise labels do not get that boost.
 */
export function titleFamilyAffinity(a: string, b: string): number {
  const tokensA = normalizeTitleTokens(a);
  const tokensB = normalizeTitleTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let shared = 0;
  for (const token of setA) {
    if (setB.has(token)) shared += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  const jaccard = union > 0 ? shared / union : 0;
  const stemLen = sharedLeadingTitleTokens(a, b).length;
  const stemScore =
    stemLen >= 2 && tokensA.length >= 4 && tokensB.length >= 4
      ? stemLen / (stemLen + 2)
      : 0;
  return Math.max(jaccard, stemScore);
}

/**
 * Bag-listed compact sibling lines (Rose vs Pink): residual would reject them
 * as `series_suffix_mismatch` without an invented FR↔EN alias. If the
 * MatchContext already carries both, keep the alias for catalog accept.
 */
function isBagListedCompactSibling(primary: string, alias: string): boolean {
  const result = residualIdentityMatch({
    requestTitles: [primary],
    candidateTitles: [alias],
  });
  return (
    result.decision === "reject" &&
    result.reasons.includes("series_suffix_mismatch")
  );
}

/**
 * Rank lookup titles for PriceCharting seek: prefer titles close to the primary
 * and specific enough to disambiguate sequels/regional editions.
 * Short franchise-only labels ("Need for Speed") sink to the end.
 */
export function rankPriceChartingSeekTitles(
  titles: readonly string[],
  primaryTitle?: string | null,
): string[] {
  const primary = (primaryTitle ?? titles[0] ?? "").trim();
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const title of titles) {
    const trimmed = title?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }

  return unique
    .map((title, index) => {
      const specificity = priceChartingSeekTitleSpecificity(title);
      const affinity = primary ? titleFamilyAffinity(title, primary) : 0;
      let score = affinity * 120;
      // Specificity only helps inside the primary family — otherwise long
      // outlier aliases (wrong generation) jump the queue.
      score += specificity * (affinity >= 0.28 ? 8 : 2);
      if (specificity <= 3) score -= 50;
      return { title, score, index };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.title);
}

/**
 * Titles trusted when accepting a catalog hit.
 * - Always keep the primary.
 * - Keep specific aliases (4+ tokens) that still share family tokens with primary.
 * - Keep bag-listed compact siblings (`series_suffix_mismatch` without invented
 *   FR↔EN aliases — e.g. Rose vs Pink only when both are already in the bag).
 * - Drop short franchise-only labels unless they are nearly identical to primary.
 * - Drop long outlier aliases (wrong generation) with weak affinity.
 */
export function priceChartingAcceptanceTitleBag(
  titleBag: readonly string[],
): string[] {
  const bag = Array.from(
    new Set(
      titleBag
        .map((title) => title?.trim())
        .filter((title): title is string => Boolean(title)),
    ),
  );
  if (bag.length === 0) return [];

  const primary = bag[0];
  const kept = bag.filter((title, index) => {
    if (index === 0) return true;
    // Drop sequel/generation outliers even when they share a franchise stem
    // ("Baten Kaitos II" next to the FR Eternal Wings primary).
    if (franchiseSequelNumbersConflict([primary], title)) return false;
    if (isBagListedCompactSibling(primary, title)) return true;
    const affinity = titleFamilyAffinity(title, primary);
    const specificity = priceChartingSeekTitleSpecificity(title);
    if (specificity <= 3) return affinity >= 0.5;
    return affinity >= 0.28;
  });

  return kept.length > 0 ? kept : bag;
}
