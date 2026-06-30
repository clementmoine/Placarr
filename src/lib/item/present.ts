import type { Attachment, Author, Metadata, Publisher } from "@prisma/client";

import { getCoverImage, getGalleryImages, getHeroImage, filterMetadataForShelfPlatform } from "@/lib/item/media";
import {
  buildCatalogExternalLink,
  metadataAliases,
} from "@/services/metadata/catalogLink";
import { formatMetadataFromStorage } from "@/services/metadata/storage";
import type { MetadataResult } from "@/types/metadataProvider";
import type { Locale } from "@/types/i18n";

export interface PresentableItemInput {
  name: string;
  barcode?: string | null;
  imageUrl?: string | null;
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
): MetadataResult | undefined {
  if (!metadata) return undefined;
  if (isStoredMetadata(metadata)) {
    return formatMetadataFromStorage(metadata);
  }
  return metadata;
}

function mediaInput(item: PresentableItemInput) {
  return {
    imageUrl: item.imageUrl,
    metadata: item.metadata,
    shelf: item.shelf,
  };
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
  const formatted = formatItemMetadata(item.metadata);
  const filteredMetadata =
    formatted && item.shelf
      ? filterMetadataForShelfPlatform(formatted, item.shelf)
      : formatted;

  return presentItem(
    {
      ...(item as PresentableItemInput),
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
