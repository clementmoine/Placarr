import { prisma } from "@/lib/db/prisma";
import { isMetadataTitleAligned } from "@/core/metadata/titleMatching";
import { allocateUniqueItemSlug } from "@/lib/routing/itemSlug";
import {
  areDisplayTitlesSameProduct,
  scoreDisplayTitle,
} from "@/core/title/displayScore";

import { isBarcodePlaceholderItemName } from "./placeholderName";

async function updateItemDisplayName(
  itemId: string,
  title: string,
  shelfId: string,
): Promise<boolean> {
  await prisma.item.update({
    where: { id: itemId },
    data: {
      name: title,
      slug: await allocateUniqueItemSlug(shelfId, title, {
        excludeItemId: itemId,
      }),
    },
  });
  return true;
}

/**
 * Promotes a cleaner enriched catalog title into `item.name` when it matches
 * the stored product identity (placeholder names or noisy retailer listings).
 */
export async function syncItemNameFromEnrichedMetadata(input: {
  itemId: string;
  metadataTitle?: string | null;
  itemName: string;
  barcode?: string | null;
}): Promise<boolean> {
  const metadataTitle = input.metadataTitle?.trim();
  if (!metadataTitle) return false;

  const itemName = input.itemName.trim();
  if (!itemName) return false;
  if (metadataTitle.toLowerCase() === itemName.toLowerCase()) return false;

  const item = await prisma.item.findUnique({
    where: { id: input.itemId },
    select: { shelfId: true },
  });
  if (!item) return false;

  if (isBarcodePlaceholderItemName(itemName, input.barcode)) {
    return updateItemDisplayName(input.itemId, metadataTitle, item.shelfId);
  }

  const sameProduct =
    areDisplayTitlesSameProduct(itemName, metadataTitle) ||
    isMetadataTitleAligned({ title: metadataTitle }, [itemName], 0.58) ||
    isMetadataTitleAligned({ title: itemName }, [metadataTitle], 0.58);
  if (!sameProduct) return false;

  if (scoreDisplayTitle(metadataTitle) <= scoreDisplayTitle(itemName)) {
    return false;
  }

  return updateItemDisplayName(input.itemId, metadataTitle, item.shelfId);
}

/** @deprecated Use syncItemNameFromEnrichedMetadata */
export async function adoptItemNameFromMetadataIfPlaceholder(input: {
  itemId: string;
  metadataTitle?: string | null;
  itemName: string;
  barcode?: string | null;
}): Promise<boolean> {
  return syncItemNameFromEnrichedMetadata(input);
}
