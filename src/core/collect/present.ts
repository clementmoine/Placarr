import type { Attachment, Author, Metadata, Publisher } from "@prisma/client";

import {
  getCoverImage,
  getGalleryImages,
  getHeroImage,
  filterMetadataForShelfPlatform,
} from "@/core/collect/media";
import { purgeContradictedProviderExternalLinks } from "@/core/enrich/providerExternalLinks";
import {
  buildCatalogExternalLink,
  metadataAliases,
} from "@/core/enrich/catalogLink";
import { formatMetadataFromStorage } from "@/core/enrich/dbMapping";
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
};

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

function formatItemMetadata(
  metadata?: StoredItemMetadata | MetadataResult | null,
  item?: { name?: string; barcode?: string | null },
): MetadataResult | undefined {
  if (!metadata) return undefined;
  const formatted = isStoredMetadata(metadata)
    ? formatMetadataFromStorage(metadata)
    : metadata;
  if (!formatted.facts?.length) return formatted;
  const facts = purgeContradictedProviderExternalLinks(
    formatted.facts,
    item?.barcode,
    item?.name,
  );
  if (facts.length === formatted.facts.length) return formatted;
  return { ...formatted, facts };
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
  const formatted = formatItemMetadata(item.metadata, {
    name: item.name,
    barcode: item.barcode,
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

export { itemWithMetadataInclude };
