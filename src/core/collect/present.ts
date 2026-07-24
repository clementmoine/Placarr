import type { Attachment, AttachmentType, Author, Metadata, PriceOffer, Publisher } from "@prisma/client";

import {
  getCoverImage,
  getGalleryImages,
  getHeroImage,
  filterMetadataForShelfPlatform,
} from "@/core/collect/media";
import {
  buildProfileProviderLinkFacts,
  coverAttachmentsFromPriceOffers,
  purgeContradictedProviderExternalLinks,
  type ProviderPriceOfferLinkInput,
} from "@/core/enrich/providerExternalLinks";
import { metadataAliases } from "@/core/enrich/aliases";
import { resolveCatalogExternalLink } from "@/core/enrich/catalogLink";
import { formatMetadataFromStorage } from "@/core/enrich/dbMapping";
import type { FieldEvidenceInput } from "@/core/enrich/evidence";
import { detectVideoGamePlatformKey } from "@/core/identify/platforms/platforms";
import type { MetadataResult } from "@/types/metadataProvider";
import type { Locale } from "@/types/i18n";
import { urlsReferToSameLocalizedImage } from "@/core/enrich/media/coverUrl";

export interface PresentableItemInput {
  name: string;
  barcode?: string | null;
  imageUrl?: string | null;
  condition?: string | null;
  updatedAt?: Date | string | null;
  metadata?: MetadataResult | null;
  shelf?: {
    type?: string | null;
    name?: string | null;
  } | null;
}

export type PresentedItem<T extends PresentableItemInput> = T & {
  /** User-entered name from storage when it differs from the canonical display title. */
  storedName?: string;
  /** External reference-catalog URL when a provider declares one for this item. */
  referenceCatalogLink?: {
    url: string;
    isDirect?: boolean;
    providerLabel?: string;
  } | null;
};

export type StoredItemMetadata = Metadata & {
  attachments?: Attachment[];
  authors?: Author[];
  publishers?: Publisher[];
  fieldEvidence?: Array<{
    field: string;
    source: string;
    value: string;
    sourceUrl?: string | null;
    priority?: number | null;
    confidence?: number | null;
  }>;
  priceOffers?: Array<
    Pick<PriceOffer, "source" | "sourceUrl" | "productName" | "rawValue">
  >;
};

const itemDetailMetadataInclude = {
  include: {
    attachments: true,
    authors: true,
    publishers: true,
    fieldEvidence: {
      select: {
        field: true,
        source: true,
        value: true,
        sourceUrl: true,
        priority: true,
        confidence: true,
      },
    },
    priceOffers: {
      select: {
        source: true,
        sourceUrl: true,
        productName: true,
        rawValue: true,
      },
    },
  },
} as const;

const itemWithMetadataInclude = {
  shelf: { select: { type: true, name: true } },
  metadata: {
    include: {
      attachments: true,
      authors: true,
      publishers: true,
    },
  },
} as const;

/** Cover rows only — enough for list/detail cover parity without full galleries. */
const itemListCoverAttachmentInclude = {
  select: {
    id: true,
    type: true,
    url: true,
    title: true,
    source: true,
    role: true,
    duration: true,
    coverProvenance: true,
    platformKey: true,
    width: true,
    height: true,
    meanLuminance: true,
    darkPixelRatio: true,
  },
  where: {
    type: { in: ["cover", "artwork", "image"] as AttachmentType[] },
  },
};

/** Lightweight metadata for shelf/collection grids — cover attachments only. */
export const itemListMetadataInclude = {
  select: {
    id: true,
    title: true,
    aliases: true,
    releaseDate: true,
    imageUrl: true,
    heroImageUrl: true,
    lastFetched: true,
    sourceType: true,
    sourceQuery: true,
    duration: true,
    pageCount: true,
    tracksCount: true,
    description: true,
    facts: true,
    attachments: itemListCoverAttachmentInclude,
    // Marketplace price rows carry listing coverUrl before metadata scrapes
    // write gallery attachments — present injects those covers on read.
    priceOffers: {
      select: {
        source: true,
        sourceUrl: true,
        productName: true,
        rawValue: true,
      },
      orderBy: { observedAt: "desc" as const },
      take: 16,
    },
  },
} as const;

function isStoredMetadata(
  metadata: StoredItemMetadata | MetadataResult,
): metadata is StoredItemMetadata {
  return "sourceType" in metadata && "sourceQuery" in metadata;
}

function mapStoredFieldEvidence(
  rows?: StoredItemMetadata["fieldEvidence"],
): FieldEvidenceInput[] | undefined {
  if (!rows?.length) return undefined;
  return rows.map((row) => ({
    field: row.field,
    source: row.source,
    value: row.value,
    sourceUrl: row.sourceUrl,
    priority: row.priority ?? undefined,
    confidence: row.confidence ?? undefined,
  }));
}

function mapStoredPriceOffers(
  rows?: StoredItemMetadata["priceOffers"],
): ProviderPriceOfferLinkInput[] | undefined {
  if (!rows?.length) return undefined;
  return rows.map((row) => ({
    source: row.source,
    sourceUrl: row.sourceUrl,
    rawValue: row.rawValue,
    productBarcode: undefined,
  }));
}

function enrichMetadataProviderLinks(
  metadata: MetadataResult,
  input: {
    fieldEvidence?: FieldEvidenceInput[];
    priceOffers?: ProviderPriceOfferLinkInput[];
    itemBarcode?: string | null;
    itemTitle?: string | null;
    shelfType?: string | null;
    platformKey?: string | null;
    catalogLink?: { url: string; providerLabel?: string } | null;
  },
): MetadataResult {
  const nonLinkFacts = (metadata.facts ?? []).filter(
    (fact) => fact.kind !== "external-link",
  );
  const linkFacts = buildProfileProviderLinkFacts({
    facts: metadata.facts,
    fieldEvidence: input.fieldEvidence,
    attachments: metadata.attachments,
    priceOffers: input.priceOffers,
    itemBarcode: input.itemBarcode,
    itemTitle: input.itemTitle,
    shelfType: input.shelfType,
    platformKey: input.platformKey ?? metadata.platformKey,
    catalogLink: input.catalogLink,
  });
  const facts = purgeContradictedProviderExternalLinks(
    [...nonLinkFacts, ...linkFacts],
    input.itemBarcode,
    input.itemTitle,
    input.shelfType,
  );

  const offerCovers = coverAttachmentsFromPriceOffers(input.priceOffers ?? [], {
    itemTitle: input.itemTitle,
    shelfType: input.shelfType,
    existingAttachments: metadata.attachments,
  });
  const attachments =
    offerCovers.length > 0
      ? [...(metadata.attachments ?? []), ...offerCovers]
      : metadata.attachments;

  const withAttachments =
    attachments !== metadata.attachments
      ? { ...metadata, attachments }
      : metadata;

  if (!facts.length) {
    const { facts: _facts, ...rest } = withAttachments;
    return rest;
  }
  return { ...withAttachments, facts };
}

function formatItemMetadata(
  metadata?: StoredItemMetadata | MetadataResult | null,
  item?: {
    name?: string;
    barcode?: string | null;
    shelfName?: string | null;
    shelfType?: string | null;
    catalogLink?: { url: string; providerLabel?: string } | null;
  },
): MetadataResult | undefined {
  if (!metadata) return undefined;
  const formatted = isStoredMetadata(metadata)
    ? formatMetadataFromStorage(metadata)
    : metadata;

  const shelfPlatformKey =
    item?.shelfType === "games"
      ? detectVideoGamePlatformKey(item.shelfName)
      : null;

  // enrichMetadataProviderLinks already purges contradicted external links —
  // do not re-run the same residual gate here (list + detail paid ×2).
  return isStoredMetadata(metadata)
    ? enrichMetadataProviderLinks(formatted, {
        fieldEvidence: mapStoredFieldEvidence(metadata.fieldEvidence),
        priceOffers: mapStoredPriceOffers(metadata.priceOffers),
        itemBarcode: item?.barcode,
        itemTitle: item?.name,
        shelfType: item?.shelfType,
        platformKey: formatted?.platformKey ?? shelfPlatformKey,
        catalogLink: item?.catalogLink,
      })
    : formatted;
}

function mediaInput(item: PresentableItemInput) {
  return {
    imageUrl: item.imageUrl,
    condition: item.condition,
    updatedAt: "updatedAt" in item ? item.updatedAt : undefined,
    metadata: item.metadata,
    shelf: item.shelf,
  };
}

function metadataHasAttachmentUrl(
  metadata: MetadataResult | undefined,
  url?: string | null,
): boolean {
  if (!metadata || !url) return false;
  return Boolean(
    metadata.attachments?.some(
      (attachment) =>
        attachment.url && urlsReferToSameLocalizedImage(attachment.url, url),
    ),
  );
}

function itemImageUrlAfterMetadataFilter(
  itemImageUrl: string | null | undefined,
  originalMetadata: MetadataResult | undefined,
  filteredMetadata: MetadataResult | undefined,
): string | null | undefined {
  if (!itemImageUrl || !originalMetadata || !filteredMetadata) {
    return itemImageUrl;
  }

  const cameFromMetadata = metadataHasAttachmentUrl(
    originalMetadata,
    itemImageUrl,
  );
  const stillAllowed = metadataHasAttachmentUrl(filteredMetadata, itemImageUrl);
  if (!cameFromMetadata || stillAllowed) return itemImageUrl;

  return filteredMetadata.imageUrl ?? null;
}

/**
 * Display title is the collector's stored name. Catalog titles stay on
 * `metadata.title` / aliases for search — enrichment never rewrites `item.name`.
 */
export function getDisplayTitle(item: PresentableItemInput): string {
  const stored = item.name?.trim();
  if (stored) return stored;
  return item.metadata?.title?.trim() || "";
}

export type PresentOptions = {
  uiLocale?: Locale | null;
};

/** Apply canonical title + cover to any item payload returned by the API. */
export function presentItem<T extends PresentableItemInput>(
  item: T,
  options?: PresentOptions,
): PresentedItem<T> {
  const storedName = item.name;
  const displayName = getDisplayTitle(item);
  const input = mediaInput(item);
  const referenceCatalogLink = item.shelf?.type
    ? resolveCatalogExternalLink(
        {
          mediaType: item.shelf.type,
          title: item.metadata?.title,
          fallbackTitle: storedName,
          shelfName: item.shelf?.name,
          barcode: item.barcode,
          aliases: metadataAliases(item.metadata?.aliases),
        },
        item.metadata?.facts,
      )
    : null;
  return {
    ...item,
    ...(displayName !== storedName ? { storedName } : {}),
    name: displayName,
    imageUrl: getCoverImage(input, options?.uiLocale),
    ...(referenceCatalogLink ? { referenceCatalogLink } : {}),
  };
}

/** Format Prisma metadata then apply canonical presentation fields. */
export function presentItemFromStorage<
  T extends Omit<PresentableItemInput, "metadata"> & {
    metadata?: StoredItemMetadata | MetadataResult | null;
    shelf?: PresentableItemInput["shelf"];
  },
>(item: T, options?: PresentOptions): T {
  const referenceCatalogLink = item.shelf?.type
    ? resolveCatalogExternalLink(
        {
          mediaType: item.shelf.type,
          title: item.metadata?.title,
          fallbackTitle: item.name,
          shelfName: item.shelf?.name,
          barcode: item.barcode,
          aliases: metadataAliases(item.metadata?.aliases),
        },
        item.metadata?.facts,
      )
    : null;
  const formatted = formatItemMetadata(item.metadata, {
    name: item.name,
    barcode: item.barcode,
    shelfName: item.shelf?.name,
    shelfType: item.shelf?.type,
    catalogLink: referenceCatalogLink,
  });
  // Prefer the user-stored title when filtering covers so grid cards match the
  // item the collector actually owns (catalog metadata title can be a sibling).
  const catalogTitle = formatted?.title;
  const metadataForShelfFilter =
    formatted && item.name?.trim()
      ? { ...formatted, title: item.name.trim() }
      : formatted;
  const filteredMetadata =
    metadataForShelfFilter && item.shelf
      ? filterMetadataForShelfPlatform(metadataForShelfFilter, item.shelf)
      : metadataForShelfFilter;
  // Restore the catalog title after filtering — the item.name override is only
  // for cover ranking, not for "Aussi connu sous" / metadata.title display.
  const metadataForPresent =
    filteredMetadata && catalogTitle != null
      ? { ...filteredMetadata, title: catalogTitle }
      : filteredMetadata;
  const imageUrl = itemImageUrlAfterMetadataFilter(
    item.imageUrl,
    formatted,
    filteredMetadata,
  );

  return presentItem(
    {
      ...(item as PresentableItemInput),
      imageUrl,
      metadata: metadataForPresent ?? null,
    },
    options,
  ) as T;
}

export function presentItemWithMedia<T extends PresentableItemInput>(
  item: T,
  options?: PresentOptions,
): T & {
  heroImageUrl: string | null;
  galleryImages: ReturnType<typeof getGalleryImages>;
} {
  const input = mediaInput(item);
  const presented = presentItem(item, options);
  return {
    ...presented,
    heroImageUrl: getHeroImage(input, options?.uiLocale),
    galleryImages: getGalleryImages(input, undefined, options?.uiLocale),
  };
}

export { itemWithMetadataInclude, itemDetailMetadataInclude };
