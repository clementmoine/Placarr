import type { Attachment, Author, Metadata, PriceOffer, Publisher } from "@prisma/client";

import {
  getCoverImage,
  getGalleryImages,
  getHeroImage,
  filterMetadataForShelfPlatform,
} from "@/core/collect/media";
import {
  buildProfileProviderLinkFacts,
  purgeContradictedProviderExternalLinks,
  type ProviderPriceOfferLinkInput,
} from "@/core/enrich/providerExternalLinks";
import {
  buildCatalogExternalLink,
  metadataAliases,
} from "@/core/enrich/catalogLink";
import { formatMetadataFromStorage } from "@/core/enrich/dbMapping";
import type { FieldEvidenceInput } from "@/core/enrich/evidence";
import type { MetadataResult } from "@/types/metadataProvider";
import type { Locale } from "@/types/i18n";
import { urlsReferToSameLocalizedImage } from "@/core/enrich/media/coverUrl";

export interface PresentableItemInput {
  name: string;
  barcode?: string | null;
  imageUrl?: string | null;
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

/** Lightweight metadata for shelf/collection grids — no attachment gallery. */
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
    catalogLink: input.catalogLink,
  });
  const facts = purgeContradictedProviderExternalLinks(
    [...nonLinkFacts, ...linkFacts],
    input.itemBarcode,
    input.itemTitle,
  );
  if (!facts.length) {
    const { facts: _facts, ...rest } = metadata;
    return rest;
  }
  return { ...metadata, facts };
}

function formatItemMetadata(
  metadata?: StoredItemMetadata | MetadataResult | null,
  item?: {
    name?: string;
    barcode?: string | null;
    catalogLink?: { url: string; providerLabel?: string } | null;
  },
): MetadataResult | undefined {
  if (!metadata) return undefined;
  const formatted = isStoredMetadata(metadata)
    ? formatMetadataFromStorage(metadata)
    : metadata;

  const enriched = isStoredMetadata(metadata)
    ? enrichMetadataProviderLinks(formatted, {
        fieldEvidence: mapStoredFieldEvidence(metadata.fieldEvidence),
        priceOffers: mapStoredPriceOffers(metadata.priceOffers),
        itemBarcode: item?.barcode,
        itemTitle: item?.name,
        catalogLink: item?.catalogLink,
      })
    : formatted;

  if (!enriched.facts?.length) return enriched;
  const facts = purgeContradictedProviderExternalLinks(
    enriched.facts,
    item?.barcode,
    item?.name,
  );
  if (facts.length === enriched.facts.length) return enriched;
  return { ...enriched, facts };
}

function mediaInput(item: PresentableItemInput) {
  return {
    imageUrl: item.imageUrl,
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

/** Canonical display title for a product across the whole app. */
export function getDisplayTitle(item: PresentableItemInput): string {
  const metadataTitle = item.metadata?.title?.trim();
  if (metadataTitle) return metadataTitle;
  return item.name;
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
    ? buildCatalogExternalLink({
        mediaType: item.shelf.type,
        title: item.metadata?.title,
        fallbackTitle: storedName,
        shelfName: item.shelf?.name,
        barcode: item.barcode,
        aliases: metadataAliases(item.metadata?.aliases),
      })
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
    ? buildCatalogExternalLink({
        mediaType: item.shelf.type,
        title: item.metadata?.title,
        fallbackTitle: item.name,
        shelfName: item.shelf?.name,
        barcode: item.barcode,
        aliases: metadataAliases(item.metadata?.aliases),
      })
    : null;
  const formatted = formatItemMetadata(item.metadata, {
    name: item.name,
    barcode: item.barcode,
    catalogLink: referenceCatalogLink,
  });
  const filteredMetadata =
    formatted && item.shelf
      ? filterMetadataForShelfPlatform(formatted, item.shelf)
      : formatted;
  const imageUrl = itemImageUrlAfterMetadataFilter(
    item.imageUrl,
    formatted,
    filteredMetadata,
  );

  return presentItem(
    {
      ...(item as PresentableItemInput),
      imageUrl,
      metadata: filteredMetadata ?? null,
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
