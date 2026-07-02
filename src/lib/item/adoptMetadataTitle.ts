import { prisma } from "@/lib/db/prisma";
import { isMetadataTitleAligned } from "@/lib/metadata/titleMatching";
import { slugifyItemName } from "@/lib/routing/slugs";
import {
  areDisplayTitlesSameProduct,
  scoreDisplayTitle,
} from "@/lib/title/displayScore";

import { isBarcodePlaceholderItemName } from "./placeholderName";

async function updateItemDisplayName(
  itemId: string,
  title: string,
): Promise<boolean> {
  await prisma.item.update({
    where: { id: itemId },
    data: {
      name: title,
      slug: slugifyItemName(title),
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

  if (isBarcodePlaceholderItemName(itemName, input.barcode)) {
    return updateItemDisplayName(input.itemId, metadataTitle);
  }

  const sameProduct =
    areDisplayTitlesSameProduct(itemName, metadataTitle) ||
    isMetadataTitleAligned({ title: metadataTitle }, [itemName], 0.58) ||
    isMetadataTitleAligned({ title: itemName }, [metadataTitle], 0.58);
  if (!sameProduct) return false;

  if (scoreDisplayTitle(metadataTitle) <= scoreDisplayTitle(itemName)) {
    return false;
  }

  return updateItemDisplayName(input.itemId, metadataTitle);
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
