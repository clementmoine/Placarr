import type { Attachment, Author, Metadata, Publisher } from "@prisma/client";

import { getCoverImage, getGalleryImages, getHeroImage } from "@/lib/itemMedia";
import { formatMetadataFromStorage, type MetadataResult } from "@/services/metadata";

export interface PresentableItemInput {
  name: string;
  imageUrl?: string | null;
  metadata?: MetadataResult | null;
  shelf?: {
    type?: string | null;
  } | null;
}

export type PresentedItem<T extends PresentableItemInput> = T & {
  /** User-entered name from storage when it differs from the canonical display title. */
  storedName?: string;
};

export type StoredItemMetadata = Metadata & {
  attachments?: Attachment[];
  authors?: Author[];
  publishers?: Publisher[];
};

const itemWithMetadataInclude = {
  shelf: { select: { type: true } },
  metadata: {
    include: {
      attachments: true,
      authors: true,
      publishers: true,
    },
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

/** Apply canonical title + cover to any item payload returned by the API. */
export function presentItem<T extends PresentableItemInput>(
  item: T,
): PresentedItem<T> {
  const storedName = item.name;
  const displayName = getDisplayTitle(item);
  const input = mediaInput(item);
  return {
    ...item,
    ...(displayName !== storedName ? { storedName } : {}),
    name: displayName,
    imageUrl: getCoverImage(input),
  };
}

/** Format Prisma metadata then apply canonical presentation fields. */
export function presentItemFromStorage<
  T extends Omit<PresentableItemInput, "metadata"> & {
    metadata?: StoredItemMetadata | MetadataResult | null;
  },
>(item: T): T {
  return presentItem({
    ...item,
    metadata: formatItemMetadata(item.metadata),
  });
}

export function presentItemWithMedia<T extends PresentableItemInput>(
  item: T,
): T & {
  heroImageUrl: string | null;
  galleryImages: ReturnType<typeof getGalleryImages>;
} {
  const input = mediaInput(item);
  const presented = presentItem(item);
  return {
    ...presented,
    heroImageUrl: getHeroImage(input),
    galleryImages: getGalleryImages(input),
  };
}

export { itemWithMetadataInclude };
