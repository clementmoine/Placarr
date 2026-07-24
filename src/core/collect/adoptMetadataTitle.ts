import { prisma } from "@/lib/db/prisma";
import { allocateUniqueItemSlug } from "@/lib/routing/itemSlug";
import { normalizeProductBarcode } from "@/core/identify/normalize";

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
 * Fills `item.name` from catalog metadata only when the collector has no real
 * title yet (empty or barcode placeholder) and a barcode is present.
 * Never rewrites a user-entered title.
 */
export async function syncItemNameFromEnrichedMetadata(input: {
  itemId: string;
  metadataTitle?: string | null;
  itemName: string;
  barcode?: string | null;
}): Promise<boolean> {
  const metadataTitle = input.metadataTitle?.trim();
  if (!metadataTitle) return false;

  if (!normalizeProductBarcode(input.barcode)) return false;

  const itemName = input.itemName.trim();
  const mayAdoptTitle =
    !itemName || isBarcodePlaceholderItemName(itemName, input.barcode);
  if (!mayAdoptTitle) return false;

  if (metadataTitle.toLowerCase() === itemName.toLowerCase()) return false;

  const item = await prisma.item.findUnique({
    where: { id: input.itemId },
    select: { shelfId: true },
  });
  if (!item) return false;

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
