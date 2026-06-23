import { filterPlatformRedundancies } from "@/lib/barcode/titleUtils";
import { VIDEO_GAME_PLATFORM_TOKEN_TERMS } from "@/lib/videoGamePlatforms";

import {
  areEvidenceSameProduct,
  buildProductEvidence,
  GENERIC_TITLE_TOKENS,
  uniqueClean,
} from "./parse";
import {
  buildDatabaseEvidence,
  filterDisplayEvidenceForSuggestions,
  NON_CANONICAL_CONTEXT_TOKENS,
  pickRepresentativeEvidence,
  resolveEvidenceToMatches,
} from "./resolve";
import { applyEditionToCompiledResult } from "./edition";
import {
  pickPlatformKeyFromEvidence,
  type CompiledResult,
  type ProductEvidence,
  type ResolvedMatch,
  type SourceProduct,
} from "./types";

/**
 * A lone marketplace listing can be wrong, but when several INDEPENDENT
 * marketplaces point at the same product, their consensus is strong evidence of
 * what the barcode physically is. When that consensus contradicts the lone
 * canonical source (typically a bad ScreenScraper barcode→game mapping), we let
 * the consensus lead: it is promoted to trusted-retailer level so it is no
 * longer capped as "listing-only" and outranks the canonical. The canonical
 * evidence is left untouched so it still surfaces as a clean, least-prioritised
 * alternate — the user then sees two clean candidates (the consensual title
 * match, and the item the canonical identified strictly by barcode).
 */
export const MARKETPLACE_CONSENSUS_MIN_PROVIDERS = 3;

// Significant, franchise-identifying tokens of a title (drops generic words,
// platform names and bare numbers — those last are handled as sequel
// indicators). Used to recognise that "Ghost Recon", "Tom Clancy's Ghost Recon"
// and "Ghost Recon Classics" all name the same franchise.
const PLATFORM_TOKEN_TERMS = new Set(VIDEO_GAME_PLATFORM_TOKEN_TERMS);

function franchiseBaseTokens(evidence: ProductEvidence): Set<string> {
  const out = new Set<string>();
  for (const token of evidence.parsed.tokens) {
    if (token.length <= 2) continue;
    if (/^\d+$/.test(token)) continue;
    if (GENERIC_TITLE_TOKENS.has(token)) continue;
    if (PLATFORM_TOKEN_TERMS.has(token)) continue;
    out.add(token);
  }
  return out;
}

// True when one franchise-token set is contained in the other and they share at
// least two identifying tokens — a strong "same franchise" signal that tolerates
// the brand prefix ("Tom Clancy's") and edition words real listings add or drop.
function shareFranchise(a: Set<string>, b: Set<string>): boolean {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size < 2) return false;
  for (const token of small) if (!big.has(token)) return false;
  return true;
}

/**
 * Largest cluster of marketplace listings that name the exact same product.
 */
function strictMarketplaceConsensus(marketplace: ProductEvidence[]): {
  items: ProductEvidence[];
  providers: number;
} {
  const clusters: ProductEvidence[][] = [];
  for (const item of marketplace) {
    const cluster = clusters.find((group) =>
      group.some((other) => areEvidenceSameProduct(other, item)),
    );
    if (cluster) cluster.push(item);
    else clusters.push([item]);
  }

  let items: ProductEvidence[] = [];
  let providers = 0;
  for (const cluster of clusters) {
    const distinct = new Set(cluster.map((item) => item.providerName)).size;
    if (distinct > providers) {
      providers = distinct;
      items = cluster;
    }
  }
  return { items, providers };
}

/**
 * Marketplace listings that name the canonical's franchise but contradict its
 * sequel number. A lone canonical claiming a sequel ("Ghost Recon 2") that *no*
 * marketplace corroborates — while several independent ones name the same
 * franchise without that number ("Ghost Recon", "Ghost Recon 1", "… Classics")
 * — is almost always a bad barcode→game mapping on the canonical's side. Real
 * listings vary too much to form a clean same-product cluster, so this groups
 * them at the franchise level instead.
 */
function sequelContradictionConsensus(
  marketplace: ProductEvidence[],
  canonicalEvidence: ProductEvidence[],
): { items: ProductEvidence[]; providers: number } {
  const numberedCanonical = canonicalEvidence.filter(
    (item) => item.parsed.indicators.size > 0,
  );
  if (numberedCanonical.length === 0) return { items: [], providers: 0 };

  const canonicalBase = new Set<string>();
  const canonicalIndicators = new Set<string>();
  for (const item of numberedCanonical) {
    for (const token of franchiseBaseTokens(item)) canonicalBase.add(token);
    for (const indicator of item.parsed.indicators) {
      canonicalIndicators.add(indicator);
    }
  }
  // Require a specific franchise (avoid latching onto one-word canonicals).
  if (canonicalBase.size < 2) return { items: [], providers: 0 };

  const items = marketplace.filter((item) => {
    if (!shareFranchise(franchiseBaseTokens(item), canonicalBase)) return false;
    // Drop listings that actually corroborate the canonical's sequel number.
    for (const indicator of canonicalIndicators) {
      if (item.parsed.indicators.has(indicator)) return false;
    }
    return true;
  });
  const providers = new Set(items.map((item) => item.providerName)).size;
  return { items, providers };
}

export function applyMarketplaceConsensusOverride(
  evidence: ProductEvidence[],
): void {
  const marketplace = evidence.filter(
    (item) => !item.isCanonical && !item.isTrustedRetailer,
  );
  const canonicalEvidence = evidence.filter((item) => item.isCanonical);
  const canonicalProviderCount = new Set(
    canonicalEvidence.map((item) => item.providerName),
  ).size;
  if (canonicalProviderCount === 0 || marketplace.length === 0) return;

  let consensus = strictMarketplaceConsensus(marketplace);
  // When the exact-product consensus is too weak, fall back to a franchise-level
  // consensus that specifically contradicts the canonical's (unsupported) sequel
  // number — see helper above.
  if (consensus.providers < MARKETPLACE_CONSENSUS_MIN_PROVIDERS) {
    const franchise = sequelContradictionConsensus(
      marketplace,
      canonicalEvidence,
    );
    if (franchise.providers > consensus.providers) consensus = franchise;
  }

  // Only override when the consensus is both strong and clearly dominant.
  if (
    consensus.providers < MARKETPLACE_CONSENSUS_MIN_PROVIDERS ||
    consensus.providers <= canonicalProviderCount
  ) {
    return;
  }

  // If any anchor already agrees with the consensus, there is no contradiction.
  const corroborated = evidence.some(
    (item) =>
      (item.isCanonical || item.isTrustedRetailer) &&
      consensus.items.some((other) => areEvidenceSameProduct(item, other)),
  );
  if (corroborated) return;

  // Promote the consensus so it leads (no listing-only confidence cap)…
  for (const item of consensus.items) {
    item.isTrustedRetailer = true;
    item.priority = Math.max(item.priority, 1);
  }
  // …and flag the contradicted canonical evidence. It stays canonical (so it
  // survives noise filtering and surfaces as a clean alternate) but its cluster
  // confidence is capped so it ranks below the consensus.
  for (const item of evidence) {
    if (
      item.isCanonical &&
      !consensus.items.some((other) => areEvidenceSameProduct(item, other))
    ) {
      item.contradictedByConsensus = true;
    }
  }
}

export async function compileResultForType(
  type: string,
  sources: {
    providerName: string;
    products: SourceProduct[];
  }[],
  cleanedBarcode: string,
): Promise<CompiledResult | null> {
  const activeSources = sources.filter(
    (s) => s.products && s.products.length > 0,
  );
  if (activeSources.length === 0) return null;

  const provider = activeSources.map((s) => s.providerName).join("+");
  const sourceEvidence: ProductEvidence[] = [];

  for (const source of activeSources) {
    for (const product of source.products) {
      const evidence = buildProductEvidence(source.providerName, product);
      if (!evidence) continue;
      if (
        type === "games" &&
        !evidence.isCanonical &&
        !evidence.isTrustedRetailer &&
        !evidence.parsed.platformKey &&
        [...evidence.parsed.tokens].some((token) =>
          NON_CANONICAL_CONTEXT_TOKENS.has(token),
        )
      ) {
        continue;
      }
      sourceEvidence.push(evidence);
    }
  }

  if (sourceEvidence.length === 0) return null;

  // Let a strong, independent marketplace consensus lead when it contradicts
  // the lone canonical source (see helper above).
  applyMarketplaceConsensusOverride(sourceEvidence);

  const canonicalEvidence = sourceEvidence.filter((item) => item.isCanonical);
  const trustedRetailerEvidence = sourceEvidence.filter(
    (item) => item.isTrustedRetailer,
  );
  const anchorEvidence = [...canonicalEvidence, ...trustedRetailerEvidence];
  const hasAnchorSignals = anchorEvidence.length > 0;
  const trustedEvidence = hasAnchorSignals
    ? sourceEvidence.filter((evidence) => {
        if (evidence.isCanonical || evidence.isTrustedRetailer) return true;
        const isRelatedToAnchor = anchorEvidence.some((anchor) =>
          areEvidenceSameProduct(anchor, evidence),
        );
        if (!isRelatedToAnchor) {
          console.log(
            `[Barcode API] Ignoring marketplace noise "${evidence.cleanName}" because anchor signals exist for ${type}`,
          );
        }
        return isRelatedToAnchor;
      })
    : sourceEvidence;

  const looksLikeAudioBarcode = /^(0?(498|499)|45|88)/.test(cleanedBarcode);
  const skipGameDatabaseFallback = type === "games" && looksLikeAudioBarcode;

  // The database fallback only exists to anchor marketplace-only results. When a
  // trusted retailer already confirmed the barcode (e.g. Philibert/Okkazeo for a
  // board game), skip it: its echo of an unmatched name would otherwise become a
  // fake canonical that outranks the clean trusted-retailer title.
  const databaseEvidence =
    hasAnchorSignals || skipGameDatabaseFallback
      ? []
      : await buildDatabaseEvidence(
          trustedEvidence
            .filter((evidence) => !evidence.isCanonical)
            .map((evidence) => evidence.cleanName),
          type,
        );

  const canAcceptMarketplaceOnlyBooks =
    type === "books" &&
    /^(978|979)/.test(cleanedBarcode) &&
    trustedEvidence.length > 0;

  if (!hasAnchorSignals && databaseEvidence.length === 0) {
    if (canAcceptMarketplaceOnlyBooks) {
      console.warn(
        `[Barcode API] No canonical resolver for ISBN ${cleanedBarcode}; using marketplace-only book hints.`,
      );
    } else {
      console.warn(
        `[Barcode API] No canonical resolver confirmed barcode ${cleanedBarcode} for ${type}; raw marketplace names ignored.`,
      );
      return null;
    }
  }

  const supportingEvidence = hasAnchorSignals
    ? trustedEvidence
    : canAcceptMarketplaceOnlyBooks
      ? trustedEvidence
      : trustedEvidence.filter((evidence) =>
          databaseEvidence.some((canonical) =>
            areEvidenceSameProduct(canonical, evidence),
          ),
        );
  const allEvidence = [...databaseEvidence, ...supportingEvidence];
  if (allEvidence.length === 0) {
    console.warn(
      `[Barcode API] No usable evidence after filtering for ${cleanedBarcode} (${type})`,
    );
    return null;
  }
  const matches = resolveEvidenceToMatches(allEvidence, type, cleanedBarcode);
  const representative =
    matches[0]?.name || pickRepresentativeEvidence(allEvidence).title;
  const displayEvidence = filterDisplayEvidenceForSuggestions(allEvidence);
  const finalSuggestions = filterPlatformRedundancies(
    uniqueClean(
      matches.flatMap((match) => [match.name, ...match.suggestions]),
      { preservePlatformSuffix: type === "games" },
    ),
  ).slice(0, 15);
  const rawNames = uniqueClean(
    displayEvidence
      .sort((a, b) => b.sourceWeight - a.sourceWeight)
      .flatMap((evidence) => [evidence.title, evidence.cleanName]),
    { preservePlatformSuffix: type === "games" },
  ).slice(0, 15);
  const platformEvidence = allEvidence.filter(
    (evidence) => !evidence.contradictedByConsensus,
  );
  const platformKey =
    type === "games"
      ? matches[0]?.platformKey ||
        pickPlatformKeyFromEvidence(
          platformEvidence.length > 0 ? platformEvidence : allEvidence,
        )
      : null;

  return applyEditionToCompiledResult(
    {
      provider,
      rawNames,
      cleanName: representative,
      suggestions: finalSuggestions,
      matches,
      platformKey,
    },
    allEvidence,
  );
}

export function scoreTypeCandidate(
  candidateType: string,
  result: CompiledResult,
  barcode: string,
  boardGameSignal = 0,
): number {
  const topMatch = result.matches[0];
  if (!topMatch) return 0;
  const evidence = topMatch.evidence;
  const isBookBarcode = /^(978|979)/.test(barcode);
  const isAudioBarcode = /^(498|602|724|731|886|888)/.test(barcode);

  let score = topMatch.confidence;
  // Canonical corroboration is about *distinct* sources agreeing, not the raw
  // number of evidence rows. A single provider can emit dozens of rows (e.g.
  // TMDB returning every localized movie alias), which must not snowball the
  // score and let a same-name movie outrank the actual game. Cap the row bonus
  // at one unit per distinct canonical provider.
  score +=
    Math.min(evidence.canonicalCount, evidence.canonicalProviders.length) *
    0.08;
  score += evidence.canonicalProviders.length * 0.05;
  score += evidence.hasCover ? 0.03 : 0;
  if (candidateType === "books" && isBookBarcode) score += 0.45;
  if (candidateType === "musics" && isAudioBarcode) score += 0.3;
  if (candidateType === "games" && (result.platformKey || "").length > 0)
    score += 0.25;

  // A board-game signal harvested from the listings (category phrase like
  // "jeu de société", or a board-game publisher) promotes `boardgames` and
  // suppresses `games`, so a coincidental same-named video game cannot win the
  // type. See detectBoardGameSignal.
  if (boardGameSignal > 0) {
    if (candidateType === "boardgames") score += boardGameSignal * 0.35;
    if (candidateType === "games") score -= boardGameSignal * 0.3;
  }

  return score;
}
