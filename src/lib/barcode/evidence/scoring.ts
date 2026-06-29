/**
 * Barcode evidence — the scoring model, in one data-driven place.
 *
 * Every tunable weight and threshold of the barcode → item pipeline lives here,
 * named and grouped by concern, so the model can be reasoned about and tuned in
 * one file instead of as magic numbers buried inside the algorithms.
 *
 * Nothing here is provider-specific: weights are applied to evidence *roles*
 * (canonical / trusted-retailer / marketplace), and every provider declares its
 * own role and source weight in its module (see `services/providerEvidence.ts`).
 * Adding a provider never touches this file.
 */

// ── Type classification ──────────────────────────────────────────────────────
// `scoreTypeCandidate` decides which item TYPE (games / movies / musics / books
// / boardgames) a barcode is, when several types each produced a plausible
// result. Bonuses reward corroboration and decisive, listing-harvested signals.
export const TYPE_SCORE = {
  /**
   * Per distinct canonical provider that corroborates the leader. Counted per
   * *distinct provider*, never per evidence row, so a single provider emitting
   * dozens of localized aliases (e.g. TMDB) cannot snowball the score and let a
   * same-named movie outrank the actual game.
   */
  canonicalCorroboration: 0.08,
  /** Flat bonus per distinct canonical provider. */
  canonicalProvider: 0.05,
  /** The leader carries a cover image. */
  cover: 0.03,
  /** Barcode sits in a reserved ISBN / audio range matching the candidate type. */
  bookBarcode: 0.45,
  audioBarcode: 0.3,
  /** A `games` result that captured a console platform key. */
  gamePlatform: 0.25,
  /**
   * Type signals harvested from the listings. Each promotes its own type and
   * suppresses the type it is most often confused with, so a coincidental
   * same-named product cannot steal the type. See the `detect*Signal` helpers.
   */
  boardGameSignal: { boardgames: 0.35, games: -0.3 },
  videoFormatSignal: { movies: 0.35, musics: -0.3 },
  videoGameSignal: { games: 0.2, musics: -0.5, movies: -0.3 },
} as const;

/** Reserved barcode ranges that identify a product type on their own. */
export const BOOK_BARCODE_PREFIX = /^(978|979)/;
export const AUDIO_BARCODE_PREFIX = /^(498|602|724|731|886|888)/;

// ── Cluster confidence ───────────────────────────────────────────────────────
// `scoreEvidenceCluster` turns one cluster of agreeing evidence into a [0,1]
// confidence. Observation-projected role weights replace `sourceWeight` when
// the title role diverges from provider flags; otherwise provider weight is kept
// so calibrated confidence locks stay stable.
export const CLUSTER_CONFIDENCE = {
  floor: 0.05,
  ceiling: 0.98,
  /** No canonical/trusted anchor: the result rests on marketplace listings only. */
  listingOnlyCap: 0.45,
  /** A canonical contradicted by a strong, independent marketplace consensus. */
  contradictedCanonicalCap: 0.4,
  multiProvider: { perExtraProvider: 0.04, cap: 0.16 },
  canonical: { perProvider: 0.06, cap: 0.18 },
  trustedRetailer: { perProvider: 0.05, cap: 0.12 },
  cover: 0.05,
  rawSupport: { perExtraRow: 0.025, cap: 0.12 },
  /**
   * Per-row factual-tier nudge folded into the cluster base score
   * (`barcodeClusterObservationContribution`). A canonical row (tier 3) lifts the
   * base more than a marketplace row (tier 1), so a canonical-anchored cluster is
   * deservedly more confident than a same-sized listing-only one — without
   * letting the within-tier `sourceWeight` outweigh the tier itself. Kept small
   * so it tunes, never decides: floors/caps and the anchor bonuses still govern.
   */
  observationTierScale: 0.01,
} as const;

// ── Alternate visibility ─────────────────────────────────────────────────────
// Once the leader is chosen, which OTHER clusters are worth offering the user as
// distinct, pickable alternates — vs. folded away as noise of the same product.
export const ALTERNATE = {
  /** A related canonical alternate this confident is genuine ambiguity. */
  strongCanonicalConfidence: 0.72,
  /** Leader not dominant and a close runner-up — real ambiguity. */
  closeRunnerUp: { leaderBelow: 0.82, maxGap: 0.18 },
  /** No dominant winner at all: surface a plausible second candidate. */
  noDominantWinner: { leaderBelow: 0.62, matchAtLeast: 0.28 },
  /** Shared franchise tokens to fold a noisy listing into the leader. */
  sharedFranchiseTokens: 2,
} as const;

// ── Marketplace corroboration / consensus ────────────────────────────────────
// Independent marketplace listings are the ground truth for what a barcode
// physically is. These thresholds gate when their consensus is strong enough to
// overrule a lone canonical (a likely bad barcode → product mapping).
export const CONSENSUS = {
  /** Distinct independent marketplaces naming the same product to overrule. */
  minProviders: 3,
  /**
   * A single dominant marketplace (e.g. one aggregator) returns many independent
   * seller listings — too few *distinct* providers for `minProviders`, but an
   * overwhelming volume. Accept a franchise-level contradiction from this many
   * providers as long as it carries at least this many disputing listings.
   */
  sequelContradiction: { minProviders: 2, minListings: 4 },
  /**
   * No-anchor DB-fallback case: promote the dominant edition cluster. Bail when
   * at least `splitGuardRatio` of the dominant listings also name the franchise
   * WITHOUT the edition number — a "Halo" vs "Halo 1" split is not a consensus.
   */
  edition: {
    minProviders: 2,
    minListings: 4,
    singleProviderMinListings: 5,
    splitGuardRatio: 0.5,
  },
  /** A listing names a franchise when it covers this ratio of its core tokens. */
  franchiseCoverageRatio: 0.6,
  /** Below this many identifying tokens, a "franchise" is too generic to act on. */
  minFranchiseTokens: 2,
} as const;

// ── Evidence role tiers (P2 observations migration) ─────────────────────────
// Factual source tier leads; per-provider `sourceWeight` only fine-tunes within
// a tier. Nothing here is provider-specific.
export const EVIDENCE_TIER = {
  canonical: 3,
  trustedRetailer: 2,
  marketplace: 1,
} as const;

export const TIER_RANK_MULTIPLIER = 1_000_000;

export function barcodeEvidenceTier(evidence: {
  isCanonical: boolean;
  isTrustedRetailer: boolean;
}): number {
  if (evidence.isCanonical) return EVIDENCE_TIER.canonical;
  if (evidence.isTrustedRetailer) return EVIDENCE_TIER.trustedRetailer;
  return EVIDENCE_TIER.marketplace;
}

export function barcodeEvidenceRankScore(evidence: {
  isCanonical: boolean;
  isTrustedRetailer: boolean;
  sourceWeight: number;
}): number {
  return (
    barcodeEvidenceTier(evidence) * TIER_RANK_MULTIPLIER + evidence.sourceWeight
  );
}

/**
 * Observation rank tie-break within the same title/image role tier. Full
 * `sourceWeight` (~0.05–0.45) must not outweigh a role tier gap (~100 pts).
 */
export const OBSERVATION_RANK_SOURCE_WEIGHT_SCALE = 0.05;

/** Cluster confidence base: tier dominates, weight is a within-tier tie-break. */
export function barcodeClusterSourceScore(evidence: {
  isCanonical: boolean;
  isTrustedRetailer: boolean;
  sourceWeight: number;
}): number {
  return barcodeEvidenceTier(evidence) + evidence.sourceWeight;
}

/** Default per-role weights when observation tier overrides provider flags. */
export const OBSERVATION_ROLE_CLUSTER_WEIGHT = {
  object_title: 0.36,
  catalog_title: 0.28,
  edition_title: 0.24,
  alias_title: 0.08 * 0.72,
  listing_title: 0.08,
  user_input_title: 0.08,
} as const;
