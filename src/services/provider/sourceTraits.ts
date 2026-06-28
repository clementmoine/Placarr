import { parseFactSourceList } from "@/lib/metadata/facts/playerFacts";
import {
  formatProviderSourceLabel,
  PROVIDERS,
} from "@/services/provider/registry";

/**
 * Provider-blind cover traits for an attachment `source`.
 *
 * The display scorer (`@/lib/media/attachmentDisplayScore`) is imported client-side and
 * must not pull in the provider registry, so it cannot read provider-declared
 * cover traits directly. Instead the server stamps those traits onto each
 * attachment (flag-on-attachment) using the helpers here, and the scorer reads
 * the booleans. Keeping the source→trait mapping registry-derived (no provider
 * literals) is what makes the scorer pass the provider-blind guard.
 */

// Canonical provider id for each known `source` token: the provider id itself
// plus any aliases it declares (e.g. a short marketplace handle).
const PROVIDER_ID_BY_SOURCE = new Map<string, string>();
for (const provider of PROVIDERS) {
  PROVIDER_ID_BY_SOURCE.set(provider.id.toLowerCase(), provider.id);
  for (const alias of provider.sourceAliases ?? []) {
    PROVIDER_ID_BY_SOURCE.set(alias.toLowerCase(), provider.id);
  }
}

const REAL_BOX_COVER_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.isRealBoxCover).map(
    (provider) => provider.id,
  ),
);

const FULL_WRAP_COVER_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.fullWrapCover).map(
    (provider) => provider.id,
  ),
);

const GAME_MEDIA_GALLERY_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.gameMediaGallerySource).map(
    (provider) => provider.id,
  ),
);

const MUSIC_GALLERY_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.musicGallerySource).map(
    (provider) => provider.id,
  ),
);

const CANONICAL_COVER_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.canonicalCover).map(
    (provider) => provider.id,
  ),
);

const DIGITAL_STOREFRONT_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.digitalStorefrontArt).map(
    (provider) => provider.id,
  ),
);

const BOARD_GAME_RATING_PROVIDER_IDS = new Set(
  PROVIDERS.filter(
    (provider) =>
      provider.nameDatabase && provider.types.includes("boardgames"),
  ).map((provider) => provider.id),
);

const PC_SPECIFIC_FACT_SOURCE_KEYS = new Set(["steamdb", "pcgamingwiki"]);

const BOARD_GAME_CONSENSUS_RATING_LABEL = "BGG (Bayes)";

const HOW_LONG_TO_BEAT_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.timeToBeatSource).map(
    (provider) => provider.id,
  ),
);

const HOW_LONG_TO_BEAT_SOURCE_PREFIXES = PROVIDERS.filter(
  (provider) => provider.timeToBeatSource && provider.timeToBeatFactSourcePrefix,
).map((provider) => provider.timeToBeatFactSourcePrefix!.toLowerCase());

const IMAGE_SCORE_ADJUSTMENT_BY_PROVIDER_ID = new Map(
  PROVIDERS.filter((provider) =>
    Number.isFinite(provider.imageScoreAdjustment),
  ).map((provider) => [
    provider.id,
    Math.round(provider.imageScoreAdjustment || 0),
  ]),
);

const RETAIL_CATALOG_IMAGE_TITLE_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.retailCatalogImageTitles).map(
    (provider) => provider.id,
  ),
);

const STRICT_SHELF_PLATFORM_COVER_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.strictShelfPlatformCover).map(
    (provider) => provider.id,
  ),
);

const AUTHORITATIVE_3D_COVER_ROLE_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.authoritative3dCoverRole).map(
    (provider) => provider.id,
  ),
);

const GRID_STYLE_COVER_LABEL_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.gridStyleCoverLabels).map(
    (provider) => provider.id,
  ),
);

const COLLECTOR_COVER_REGION_FROM_AGE_RATING_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.collectorCoverRegionFromAgeRating).map(
    (provider) => provider.id,
  ),
);

const COVER_DEFAULT_REGION_BY_PROVIDER_ID = new Map(
  PROVIDERS.filter((provider) => provider.coverDefaultRegion).map(
    (provider) => [provider.id, provider.coverDefaultRegion!],
  ),
);

// Provider id → human display label (registry `info.label`). Used to stamp a
// gallery chip label onto attachments so the client-safe label formatter need
// not carry a provider-id→label map.
const PROVIDER_LABEL_BY_ID = new Map(
  PROVIDERS.map((provider) => [provider.id, provider.label]),
);

/**
 * Resolve an attachment `source` to its canonical provider id. Sources may be a
 * provider id, a declared alias, or carry a "· region" / "/ variant" suffix; the
 * suffix is dropped and the alias resolved. Unknown sources are returned
 * normalised (lower-cased, suffix-stripped) so non-provider tags pass through.
 */
export function canonicalProviderIdForSource(
  source?: string | null,
): string | null {
  if (!source) return null;
  const normalized = source.split(/[·/]/)[0].toLowerCase().trim();
  if (!normalized) return null;
  return PROVIDER_ID_BY_SOURCE.get(normalized) ?? normalized;
}

/**
 * Whether the source provider's cover depicts the real physical box
 * (provider-declared `isRealBoxCover` trait). Stamped onto attachments so the
 * scorer can award the box-cover bonus.
 */
export function isRealBoxCoverSource(source?: string | null): boolean {
  const id = canonicalProviderIdForSource(source);
  return id !== null && REAL_BOX_COVER_PROVIDER_IDS.has(id);
}

/**
 * Whether the source provider's covers are full front+back wraps
 * (provider-declared `fullWrapCover` trait), which the scorer penalises.
 */
export function isFullWrapCoverSource(source?: string | null): boolean {
  const id = canonicalProviderIdForSource(source);
  return id !== null && FULL_WRAP_COVER_PROVIDER_IDS.has(id);
}

export function isGameMediaGallerySource(source?: string | null): boolean {
  const id = canonicalProviderIdForSource(source);
  return id !== null && GAME_MEDIA_GALLERY_PROVIDER_IDS.has(id);
}

export function isMusicGallerySource(source?: string | null): boolean {
  const id = canonicalProviderIdForSource(source);
  return id !== null && MUSIC_GALLERY_PROVIDER_IDS.has(id);
}

export function isCanonicalCoverSource(source?: string | null): boolean {
  const id = canonicalProviderIdForSource(source);
  return id !== null && CANONICAL_COVER_PROVIDER_IDS.has(id);
}

/**
 * Human display label (registry `info.label`) for a provider source, or null for
 * a non-provider tag (barcode/merged/…) or an unknown source. Stamped onto
 * attachments so the gallery label formatter stays registry-free.
 */
export function providerLabelForSource(source?: string | null): string | null {
  const id = canonicalProviderIdForSource(source);
  return (id !== null && PROVIDER_LABEL_BY_ID.get(id)) || null;
}

export function providerImageScoreAdjustmentForSource(
  source?: string | null,
): number | undefined {
  const id = canonicalProviderIdForSource(source);
  if (id === null) return undefined;
  const adjustment = IMAGE_SCORE_ADJUSTMENT_BY_PROVIDER_ID.get(id);
  return adjustment === 0 ? undefined : adjustment;
}

export function retailCatalogImageTitleSource(source?: string | null): boolean {
  const id = canonicalProviderIdForSource(source);
  return id !== null && RETAIL_CATALOG_IMAGE_TITLE_PROVIDER_IDS.has(id);
}

export function strictShelfPlatformCoverSource(source?: string | null): boolean {
  const id = canonicalProviderIdForSource(source);
  return id !== null && STRICT_SHELF_PLATFORM_COVER_PROVIDER_IDS.has(id);
}

export function authoritative3dCoverRoleSource(source?: string | null): boolean {
  const id = canonicalProviderIdForSource(source);
  return id !== null && AUTHORITATIVE_3D_COVER_ROLE_PROVIDER_IDS.has(id);
}

export function gridStyleCoverLabelSource(source?: string | null): boolean {
  const id = canonicalProviderIdForSource(source);
  return id !== null && GRID_STYLE_COVER_LABEL_PROVIDER_IDS.has(id);
}

export function collectorCoverRegionFromAgeRatingSource(
  source?: string | null,
): boolean {
  const id = canonicalProviderIdForSource(source);
  return (
    id !== null && COLLECTOR_COVER_REGION_FROM_AGE_RATING_PROVIDER_IDS.has(id)
  );
}

export function coverDefaultRegionForSource(
  source?: string | null,
): string | undefined {
  const id = canonicalProviderIdForSource(source);
  if (id === null) return undefined;
  return COVER_DEFAULT_REGION_BY_PROVIDER_ID.get(id);
}

/**
 * Stamp the provider-declared, registry-derived attachment fields (cover-scoring
 * flags + display label) onto an attachment so the client-safe display scorer
 * and label formatter can read them without importing the registry. Pure:
 * returns a new object, leaving the input untouched.
 */
export function withProviderAttachmentTraits<
  T extends { source?: string | null },
>(
  attachment: T,
): T & {
  isRealBoxCoverSource: boolean;
  isFullWrapCoverSource: boolean;
  isGameMediaGallerySource: boolean;
  isMusicGallerySource: boolean;
  isCanonicalCoverSource: boolean;
  retailCatalogImageTitlesSource: boolean;
  strictShelfPlatformCoverSource: boolean;
  authoritative3dCoverRoleSource: boolean;
  gridStyleCoverLabelsSource: boolean;
  collectorCoverRegionFromAgeRatingSource: boolean;
  coverDefaultRegion?: string;
  providerLabel?: string;
} {
  return {
    ...attachment,
    isRealBoxCoverSource: isRealBoxCoverSource(attachment.source),
    isFullWrapCoverSource: isFullWrapCoverSource(attachment.source),
    isGameMediaGallerySource: isGameMediaGallerySource(attachment.source),
    isMusicGallerySource: isMusicGallerySource(attachment.source),
    isCanonicalCoverSource: isCanonicalCoverSource(attachment.source),
    retailCatalogImageTitlesSource: retailCatalogImageTitleSource(
      attachment.source,
    ),
    strictShelfPlatformCoverSource: strictShelfPlatformCoverSource(
      attachment.source,
    ),
    authoritative3dCoverRoleSource: authoritative3dCoverRoleSource(
      attachment.source,
    ),
    gridStyleCoverLabelsSource: gridStyleCoverLabelSource(attachment.source),
    collectorCoverRegionFromAgeRatingSource:
      collectorCoverRegionFromAgeRatingSource(attachment.source),
    coverDefaultRegion: coverDefaultRegionForSource(attachment.source),
    providerImageScoreAdjustment: providerImageScoreAdjustmentForSource(
      attachment.source,
    ),
    providerLabel: providerLabelForSource(attachment.source) ?? undefined,
  };
}

export function isDigitalStorefrontFactSource(
  source?: string | null,
): boolean {
  const id = canonicalProviderIdForSource(source);
  return id !== null && DIGITAL_STOREFRONT_PROVIDER_IDS.has(id);
}

export function isBoardGameRatingFactSource(
  source?: string | null,
  label?: string | null,
): boolean {
  const id = canonicalProviderIdForSource(source);
  if (id !== null && BOARD_GAME_RATING_PROVIDER_IDS.has(id)) return true;
  const normalizedLabel = label?.trim();
  if (!normalizedLabel) return false;
  if (normalizedLabel === BOARD_GAME_CONSENSUS_RATING_LABEL) return true;
  for (const providerId of BOARD_GAME_RATING_PROVIDER_IDS) {
    const providerLabel = PROVIDER_LABEL_BY_ID.get(providerId);
    if (providerLabel && normalizedLabel === providerLabel) return true;
  }
  return false;
}

export function isPcSpecificFactSource(
  source?: string | null,
  label?: string | null,
): boolean {
  if (isDigitalStorefrontFactSource(source)) return true;
  const normalizedSource = source?.split(/[·/,]/)[0].toLowerCase().trim();
  if (normalizedSource && PC_SPECIFIC_FACT_SOURCE_KEYS.has(normalizedSource)) {
    return true;
  }
  const normalizedLabel = (label || "").toLowerCase();
  return (
    normalizedLabel === "steamdb" || normalizedLabel === "pcgamingwiki"
  );
}

export function isHowLongToBeatFactSource(source?: string | null): boolean {
  if (!source) return false;
  const id = canonicalProviderIdForSource(source);
  if (id !== null && HOW_LONG_TO_BEAT_PROVIDER_IDS.has(id)) return true;
  const normalized = source.trim().toLowerCase();
  return HOW_LONG_TO_BEAT_SOURCE_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

type FactSourceStampInput = {
  source?: string | null;
  label?: string;
  sourceNames?: string[];
  isHowLongToBeatSource?: boolean;
  providerLabel?: string;
};

function formatStampedFactSourceToken(
  fact: FactSourceStampInput,
  sourceToken: string,
): string {
  const trimmed = sourceToken.trim();
  if (!trimmed) return trimmed;

  if (fact.isHowLongToBeatSource || isHowLongToBeatFactSource(trimmed)) {
    const hltbMatch = trimmed.match(/^how long to beat(?:\s*·\s*(.+))?$/i);
    if (hltbMatch) {
      const platform = hltbMatch[1]?.trim();
      return platform ? `How Long to Beat · ${platform}` : "How Long to Beat";
    }
  }

  const parsedSources = fact.source ? parseFactSourceList(fact.source) : [];
  if (
    fact.providerLabel &&
    parsedSources.length === 1 &&
    parsedSources[0] === trimmed
  ) {
    return fact.providerLabel;
  }

  return formatProviderSourceLabel(trimmed);
}

function stampFactSourceNames(fact: FactSourceStampInput): string[] | undefined {
  const rawTokens =
    fact.sourceNames && fact.sourceNames.length > 0
      ? fact.sourceNames
      : fact.source
        ? parseFactSourceList(fact.source)
        : [];
  if (rawTokens.length === 0) return undefined;

  const normalizedCount = fact.source?.trim().toLowerCase();
  if (
    rawTokens.length === 1 &&
    normalizedCount &&
    /^\d+\s+sources?$/.test(normalizedCount)
  ) {
    return undefined;
  }

  return Array.from(
    new Set(rawTokens.map((token) => formatStampedFactSourceToken(fact, token))),
  );
}

/**
 * Stamp provider-declared fact traits so the item page can filter and label
 * facts without importing the registry.
 */
export function withProviderFactTraits<
  T extends {
    source?: string | null;
    label?: string;
    sourceNames?: string[];
  },
>(
  fact: T,
): T & {
  isBoardGameRatingSource: boolean;
  isPcSpecificFact: boolean;
  isDigitalStorefrontSource: boolean;
  isHowLongToBeatSource: boolean;
  providerLabel?: string;
  sourceNames?: string[];
} {
  const stamped = {
    ...fact,
    isBoardGameRatingSource: isBoardGameRatingFactSource(
      fact.source,
      fact.label,
    ),
    isPcSpecificFact: isPcSpecificFactSource(fact.source, fact.label),
    isDigitalStorefrontSource: isDigitalStorefrontFactSource(fact.source),
    isHowLongToBeatSource: isHowLongToBeatFactSource(fact.source),
    providerLabel: providerLabelForSource(fact.source) ?? undefined,
  };
  const sourceNames = stampFactSourceNames(stamped);
  return sourceNames ? { ...stamped, sourceNames } : stamped;
}
