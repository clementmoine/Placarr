import {
  filterPlatformRedundancies,
  getSequelIndicators,
} from "@/lib/barcode/titleUtils";
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

// A wrong canonical sequel/edition number is, in the wild, usually disputed by a
// single dominant marketplace (e.g. PicClick) returning many listings — too few
// *distinct* providers for the strict gate above, but an overwhelming volume of
// independent listings that no source corroborates. When the number is
// uncorroborated, accept the franchise-level contradiction from ≥2 providers as
// long as it carries at least this many disputing listings.
export const SEQUEL_CONTRADICTION_MIN_PROVIDERS = 2;
export const SEQUEL_CONTRADICTION_MIN_LISTINGS = 4;

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

// The franchise identity of a *numbered* canonical, without its edition subtitle
// or sequel number: drop everything after the first ":" ("… III : The Manhattan
// Project" → "… III") and any number / roman-numeral / number-word token. This
// clean core is what listings are matched against, so "Teenage Mutant Ninja
// Turtles III : The Manhattan Project" reduces to {teenage,mutant,ninja,turtles}.
function franchiseCoreTokens(evidence: ProductEvidence): Set<string> {
  const beforeSubtitle = evidence.cleanName.split(":")[0] ?? evidence.cleanName;
  const out = new Set<string>();
  for (const token of beforeSubtitle.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length <= 2) continue;
    if (/^\d+$/.test(token)) continue;
    if (GENERIC_TITLE_TOKENS.has(token)) continue;
    if (PLATFORM_TOKEN_TERMS.has(token)) continue;
    if (getSequelIndicators(token).size > 0) continue; // 2 / ii / iii / two…
    out.add(token);
  }
  return out;
}

// A listing names the canonical's franchise when it covers most of that clean
// core, with ≥2 identifying tokens in common. Coverage is measured against the
// smaller of the two sets so it tolerates both listing noise ("… NES Tested
// CIB") and the brand prefix or regional variant real listings add or drop
// ("Ghost Recon" vs "Tom Clancy's Ghost Recon"; "Hero" vs "Ninja" Turtles).
function sharesFranchiseCore(
  core: Set<string>,
  listingFranchise: Set<string>,
): boolean {
  if (core.size < 2 || listingFranchise.size === 0) return false;
  let shared = 0;
  for (const token of core) if (listingFranchise.has(token)) shared++;
  const minSize = Math.min(core.size, listingFranchise.size);
  return shared >= 2 && shared >= Math.ceil(minSize * 0.6);
}

// True when one franchise-token set is contained in the other and they share at
// least two identifying tokens — a strong "same franchise" signal that tolerates
// the brand prefix ("Tom Clancy's") and edition words real listings add or drop.
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
): {
  items: ProductEvidence[];
  numberedCanonical: ProductEvidence[];
  disputingProviders: number;
  numberedProviders: number;
  numberCited: boolean;
} {
  const empty = {
    items: [],
    numberedCanonical: [],
    disputingProviders: 0,
    numberedProviders: 0,
    numberCited: false,
  };
  const numberedCanonical = canonicalEvidence.filter(
    (item) => item.parsed.indicators.size > 0,
  );
  if (numberedCanonical.length === 0) return empty;

  const canonicalCore = new Set<string>();
  const canonicalIndicators = new Set<string>();
  for (const item of numberedCanonical) {
    for (const token of franchiseCoreTokens(item)) canonicalCore.add(token);
    for (const indicator of item.parsed.indicators) {
      canonicalIndicators.add(indicator);
    }
  }
  // Require a specific franchise (avoid latching onto one-word canonicals).
  if (canonicalCore.size < 2) return empty;

  const sharesFranchise = (item: ProductEvidence) =>
    sharesFranchiseCore(canonicalCore, franchiseBaseTokens(item));
  const citesCanonicalNumber = (item: ProductEvidence) => {
    for (const indicator of canonicalIndicators) {
      if (item.parsed.indicators.has(indicator)) return true;
    }
    return false;
  };

  // A second canonical (e.g. IGDB via ScanDex) that names the same franchise but
  // omits the number is strong, independent evidence the number is a bad mapping;
  // it counts toward the dispute alongside the marketplace listings.
  const otherCanonical = canonicalEvidence.filter(
    (item) => !numberedCanonical.includes(item),
  );

  // If anything sharing the franchise actually cites the number, it is real — do
  // not treat it as a misnumbering.
  const numberCited = [...marketplace, ...otherCanonical].some(
    (item) => sharesFranchise(item) && citesCanonicalNumber(item),
  );

  // Marketplace listings that name the franchise but omit the number dispute it
  // (these are the ones we promote); disagreeing peer canonicals strengthen the
  // dispute but are already anchors, so they only count toward the provider tally.
  const items = marketplace.filter(
    (item) => sharesFranchise(item) && !citesCanonicalNumber(item),
  );
  const disputingCanonicals = otherCanonical.filter(
    (item) => sharesFranchise(item) && !citesCanonicalNumber(item),
  );
  const disputingProviders = new Set(
    [...items, ...disputingCanonicals].map((item) => item.providerName),
  ).size;
  const numberedProviders = new Set(
    numberedCanonical.map((item) => item.providerName),
  ).size;
  return {
    items,
    numberedCanonical,
    disputingProviders,
    numberedProviders,
    numberCited,
  };
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

  // Promote the disputing marketplace listings to trusted-retailer level (no
  // "listing-only" confidence cap) and cap the contradicted canonical(s). A
  // contradicted canonical stays canonical so it still surfaces as a clean
  // least-prioritised alternate.
  const promote = (
    itemsToTrust: ProductEvidence[],
    contradicted: ProductEvidence[],
  ) => {
    for (const item of itemsToTrust) {
      item.isTrustedRetailer = true;
      item.priority = Math.max(item.priority, 1);
    }
    for (const item of contradicted) item.contradictedByConsensus = true;
  };

  // Path 1 — a strong, independent SAME-PRODUCT marketplace consensus overrules a
  // lone canonical, unless an anchor already agrees (then it wins on its own).
  const strict = strictMarketplaceConsensus(marketplace);
  if (
    strict.providers >= MARKETPLACE_CONSENSUS_MIN_PROVIDERS &&
    strict.providers > canonicalProviderCount
  ) {
    const corroborated = evidence.some(
      (item) =>
        (item.isCanonical || item.isTrustedRetailer) &&
        strict.items.some((other) => areEvidenceSameProduct(item, other)),
    );
    if (!corroborated) {
      promote(
        strict.items,
        canonicalEvidence.filter(
          (item) =>
            !strict.items.some((other) => areEvidenceSameProduct(item, other)),
        ),
      );
      return;
    }
    // Corroborated: an anchor already names the consensus product. It normally
    // wins on its own — but a disagreeing *numbered* canonical can still
    // out-weight it (e.g. ScreenScraper "… III" vs IGDB's base title), so fall
    // through to the franchise path below to demote that one.
  }

  // Path 2 — a franchise-level contradiction of the canonical's UNCORROBORATED
  // sequel/edition number. That number is often disputed by one dominant
  // marketplace's many listings and/or a second, disagreeing canonical, so we
  // count listing volume and peer canonicals — never when any source cites it.
  const franchise = sequelContradictionConsensus(marketplace, canonicalEvidence);
  const qualifies =
    !franchise.numberCited &&
    franchise.disputingProviders > franchise.numberedProviders &&
    (franchise.disputingProviders >= MARKETPLACE_CONSENSUS_MIN_PROVIDERS ||
      (franchise.disputingProviders >= SEQUEL_CONTRADICTION_MIN_PROVIDERS &&
        franchise.items.length >= SEQUEL_CONTRADICTION_MIN_LISTINGS));
  if (qualifies) promote(franchise.items, franchise.numberedCanonical);
}

// Minimum independent listings carrying an edition number for it to be a real
// marketplace consensus (not one noisy listing).
const EDITION_CONSENSUS_MIN_LISTINGS = 4;

/**
 * The no-anchor counterpart of the sequel-contradiction override. When NO
 * canonical source identifies the barcode, the result falls back to a database
 * lookup of marketplace names — where a single wrong mapping (e.g. PriceCharting
 * naming the franchise BASE) can out-rank the specific sequel/edition that the
 * marketplace overwhelmingly names. When many independent listings carry an
 * edition number, promote those listings to trusted-retailer level so they anchor
 * and lead, bypassing the contaminating base lookup ("… II: The Arcade Game" vs a
 * lone "Teenage Mutant Ninja Turtles").
 */
function applyMarketplaceEditionConsensus(evidence: ProductEvidence[]): void {
  // Only the no-anchor case — a canonical source (or the override above) decides
  // otherwise.
  if (evidence.some((item) => item.isCanonical || item.isTrustedRetailer)) return;
  const marketplace = evidence;
  if (marketplace.length < EDITION_CONSENSUS_MIN_LISTINGS) return;

  // The edition number carried by the most marketplace listings.
  const listingsByIndicator = new Map<string, ProductEvidence[]>();
  for (const item of marketplace) {
    for (const indicator of item.parsed.indicators) {
      const list = listingsByIndicator.get(indicator) ?? [];
      list.push(item);
      listingsByIndicator.set(indicator, list);
    }
  }
  let dominant: string | null = null;
  let dominantListings: ProductEvidence[] = [];
  for (const [indicator, list] of listingsByIndicator) {
    if (list.length > dominantListings.length) {
      dominant = indicator;
      dominantListings = list;
    }
  }
  if (dominant === null || dominantListings.length < EDITION_CONSENSUS_MIN_LISTINGS) {
    return;
  }
  // Require ≥2 independent providers (not one source repeating itself).
  if (new Set(dominantListings.map((i) => i.providerName)).size < 2) return;

  const core = new Set<string>();
  for (const item of dominantListings) {
    for (const token of franchiseCoreTokens(item)) core.add(token);
  }
  if (core.size < 2) return;

  // Bail when the same franchise is also strongly named WITHOUT the number — a
  // split like "Halo" vs "Halo 1" is not a real edition consensus.
  const withoutDominant = marketplace.filter(
    (item) =>
      !item.parsed.indicators.has(dominant) &&
      sharesFranchiseCore(core, franchiseBaseTokens(item)),
  ).length;
  if (withoutDominant * 2 >= dominantListings.length) return;

  // Promote the edition listings so they anchor and lead.
  for (const item of dominantListings) {
    item.isTrustedRetailer = true;
    item.priority = Math.max(item.priority, 1);
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
  // With no canonical source at all, let a strong marketplace edition consensus
  // anchor the result (so a lone wrong "base" database mapping cannot win).
  applyMarketplaceEditionConsensus(sourceEvidence);

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
  videoFormatSignal = 0,
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

  // A video-format signal (LaserDisc/VHS/animated film) promotes `movies` and
  // suppresses `musics`, so a same-named soundtrack album cannot win the type of
  // a scanned film. See detectVideoFormatSignal.
  if (videoFormatSignal > 0) {
    if (candidateType === "movies") score += videoFormatSignal * 0.35;
    if (candidateType === "musics") score -= videoFormatSignal * 0.3;
  }

  return score;
}
