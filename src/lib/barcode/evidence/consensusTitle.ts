import {
  getSequelIndicators,
  normalizeForTokens,
} from "@/lib/barcode/titleUtils";

import { GENERIC_TITLE_TOKENS } from "./parse";

/**
 * Agnostic title selection by token corroboration — NOT by special-casing the
 * kind of difference (sequel number, edition subtitle, romhack, year, prefix…).
 *
 * The principle: independent marketplace listings are the ground truth for what
 * a barcode physically is. So the displayed title is the most specific form the
 * marketplace consensus CORROBORATES, token by token:
 *  - a token the canonical carries but NO listing echoes is a bad mapping →
 *    dropped ("Zumba Fitness World Party" → "Zumba Fitness", "Mario Kart CTGP
 *    Revolution Mod" → "Mario Kart", "Nouvelles Attractions : Carnival" → "Carnival");
 *  - a token the listings overwhelmingly carry but the canonical lacks is the
 *    real edition → added ("Just Dance" → "Just Dance 2019");
 *  - a token both agree on stays, in the canonical's clean spelling ("Gottlieb
 *    Pinball Classics", "Tom Clancy's Ghost Recon").
 *
 * The canonical provides clean spelling/order; the marketplace provides identity.
 */

export type ConsensusTitleInput = {
  /** Clean titles from canonical/authoritative sources (may be empty). */
  canonical: string[];
  /** Clean titles from independent marketplace listings — ONE per listing (vote). */
  marketplace: string[];
};

// A token must reach this share of listings (and at least this count) to be a
// marketplace-AGREED part of the title — so one noisy listing can't inject a
// token, but a year/edition the sellers overwhelmingly carry is kept.
const MARKETPLACE_MAJORITY_RATIO = 0.5;
const MARKETPLACE_MIN_COUNT = 2;

// Per-token scoring. A consensus (majority) token is rewarded; a token NO listing
// carries is heavily penalised — heavier than the cover reward — because it is a
// likely canonical fabrication ("… World Party", "… CTGP Mod", "Nouvelles
// Attractions …"). A token only a MINORITY of listings carry is left neutral, so
// a real-but-abbreviated brand prefix ("Tom Clancy's") survives without letting a
// coincidental shared token ("party") pull a wrong edition through.
const COVER_REWARD = 10;
const ZERO_CORROBORATION_PENALTY = 14;
// A token only a minority of listings carry gets a SMALL penalty: enough to drop
// a lone seller placeholder ("Inconnu Just Dance 2019" → "Just Dance 2019") on
// the tie-break, but small enough that a real brand prefix ("Tom Clancy's",
// kept by the canonical bonus) still survives.
const MINORITY_PENALTY = 1;
const CANONICAL_BONUS = 3;

// Display-casing quality of a title, so two candidates the corroboration scores
// equally don't get separated by length alone — otherwise a stray all-lowercase
// listing ("tom clancy ghost recon") beats the clean "Tom Clancy's Ghost Recon"
// just for being a couple of characters shorter. Well-cased (mixed upper+lower)
// beats ALL-CAPS beats all-lowercase. Unicode-safe (handles "Édition").
function casingRank(title: string): number {
  const hasUpper = title !== title.toLowerCase();
  const hasLower = title !== title.toUpperCase();
  if (hasUpper && hasLower) return 2;
  if (hasUpper) return 1;
  return 0;
}

function significantTokens(title: string): string[] {
  const out: string[] = [];
  for (const token of normalizeForTokens(title)
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)) {
    if (!token || GENERIC_TITLE_TOKENS.has(token)) continue;
    // A sequel marker in ANY notation — digit, roman ("II"), or word ("two") —
    // is a meaningful token, normalised to its number so all three corroborate
    // together ("Turtles II" == "Turtles 2") and a sequel still differs from its
    // base ("Ghost Recon 2" ≠ "Ghost Recon"). Single letters (i/v/x) are too
    // ambiguous to treat as numerals, so require length ≥2 (or a bare digit).
    const sequel = getSequelIndicators(token);
    if (sequel.size > 0 && (token.length >= 2 || /^\d+$/.test(token))) {
      out.push([...sequel][0]);
      continue;
    }
    // Otherwise keep words >2 chars and bare numbers (incl. years like "2019").
    if (token.length > 2 || /^\d+$/.test(token)) out.push(token);
  }
  return out;
}

function listingTokenCounts(listings: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const listing of listings) {
    for (const token of new Set(significantTokens(listing))) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return counts;
}

function scoreCandidate(
  title: string,
  counts: Map<string, number>,
  majority: number,
  isCanonical: boolean,
): number {
  let score = isCanonical ? CANONICAL_BONUS : 0;
  for (const token of new Set(significantTokens(title))) {
    const count = counts.get(token) ?? 0;
    if (count >= majority)
      score += COVER_REWARD; // the marketplace agrees on this token
    else if (count >= 1)
      score -= MINORITY_PENALTY; // real but minority token — mild
    else score -= ZERO_CORROBORATION_PENALTY; // no listing has it — fabrication
  }
  return score;
}

/**
 * Pick the existing title (canonical or listing) that best fits the marketplace
 * token consensus. Returns null only when there is no usable title at all.
 */
export function selectConsensusTitle(
  input: ConsensusTitleInput,
): string | null {
  const canonical = input.canonical.filter((title) => title.trim());
  const listings = input.marketplace.filter((title) => title.trim());

  // No marketplace to corroborate against → trust the canonical wholesale
  // (cleanest = shortest), falling back to the first listing if no canonical.
  if (listings.length === 0) {
    const pool = canonical.length > 0 ? canonical : input.marketplace;
    return (
      pool
        .map((title) => title.trim())
        .filter(Boolean)
        .sort((a, b) => a.length - b.length)[0] ?? null
    );
  }

  const counts = listingTokenCounts(listings);
  const majority = Math.max(
    MARKETPLACE_MIN_COUNT,
    Math.ceil(listings.length * MARKETPLACE_MAJORITY_RATIO),
  );

  const candidates = [
    ...canonical.map((title) => ({ title, isCanonical: true })),
    ...listings.map((title) => ({ title, isCanonical: false })),
  ];

  let best: {
    title: string;
    score: number;
    casing: number;
    length: number;
  } | null = null;
  for (const { title, isCanonical } of candidates) {
    const trimmed = title.trim();
    const score = scoreCandidate(title, counts, majority, isCanonical);
    const casing = casingRank(trimmed);
    const length = trimmed.length;
    // Tie-breaks, in order: better display casing first (so a clean
    // "Tom Clancy's Ghost Recon" beats a stray lowercased duplicate), then the
    // shorter title (no trailing seller noise).
    const better =
      !best ||
      score > best.score ||
      (score === best.score && casing > best.casing) ||
      (score === best.score && casing === best.casing && length < best.length);
    if (better) best = { title: trimmed, score, casing, length };
  }
  return best?.title ?? null;
}
