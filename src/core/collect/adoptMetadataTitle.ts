import { prisma } from "@/lib/db/prisma";
import { allocateUniqueItemSlug } from "@/lib/routing/itemSlug";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import { parsePrintKey } from "@/core/identify/printKey";
import {
  metadataAliases,
  promoteTitleKeepingAliases,
} from "@/core/enrich/aliases";
import { usesPrintSearch } from "@/lib/printSearchTypes";
import type { Type } from "@/generated/prisma/browser";

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

/**
 * Print shelves: a pasted code (`TFC#001`) is a lookup key, not the title.
 * When enrich lands a printKey the item lacked, adopt the catalog title and
 * persist the key so prices / foil resolve like a PrintPicker add.
 *
 * The previous collector code is kept as a metadata alias so `/tfc-2` URLs
 * still resolve after the slug becomes the catalog title.
 */
export async function syncPrintItemIdentityFromMetadata(input: {
  itemId: string;
  shelfType: Type;
  itemName: string;
  metadataTitle?: string | null;
  metadataPrintKey?: string | null;
}): Promise<boolean> {
  if (!usesPrintSearch(input.shelfType)) return false;

  const metadataPrintKey = input.metadataPrintKey?.trim().toLowerCase() || null;
  const printKey =
    metadataPrintKey && parsePrintKey(metadataPrintKey)
      ? metadataPrintKey
      : null;
  const metadataTitle = input.metadataTitle?.trim() || null;
  if (!printKey && !metadataTitle) return false;

  const item = await prisma.item.findUnique({
    where: { id: input.itemId },
    select: {
      shelfId: true,
      printKey: true,
      name: true,
      metadataId: true,
      metadata: { select: { aliases: true, title: true } },
    },
  });
  if (!item) return false;

  const hadPrintKey = Boolean(item.printKey?.trim());
  const data: { printKey?: string; name?: string; slug?: string } = {};
  let lookupAlias: string | null = null;

  if (printKey && !hadPrintKey) {
    data.printKey = printKey;
  }

  const currentName = (item.name || input.itemName).trim();
  if (
    metadataTitle &&
    metadataTitle.toLowerCase() !== currentName.toLowerCase() &&
    !hadPrintKey
  ) {
    data.name = metadataTitle;
    data.slug = await allocateUniqueItemSlug(item.shelfId, metadataTitle, {
      excludeItemId: input.itemId,
    });
    lookupAlias = currentName || null;
  }

  if (Object.keys(data).length === 0) return false;

  await prisma.item.update({
    where: { id: input.itemId },
    data,
  });

  if (lookupAlias && item.metadataId) {
    const aliases = promoteTitleKeepingAliases(
      {
        title: metadataTitle,
        aliases: metadataAliases(item.metadata?.aliases),
      },
      metadataTitle!,
      [lookupAlias],
    );
    if (aliases?.length) {
      await prisma.metadata.update({
        where: { id: item.metadataId },
        data: { aliases: JSON.stringify(aliases) },
      });
    }
  }

  return true;
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
