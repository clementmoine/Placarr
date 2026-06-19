import { AttachmentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  explainAttachmentScoreForDisplay,
  type AttachmentDisplayScoreDetails,
  type ScoredAttachmentInput,
} from "@/lib/attachmentDisplayScore";
import { fetchMetadataByType } from "@/services/metadataFetch";
import {
  formatMetadataFromStorage,
  getCachedMetadata,
  storeMetadata,
} from "@/services/metadataStorage";
import type { Item, Type } from "@prisma/client";
import type { MetadataResult } from "@/types/metadataProvider";

export {
  explainAttachmentScoreForDisplay,
  type AttachmentDisplayScoreDetails,
  type ScoredAttachmentInput,
};

export type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

export {
  formatMetadataForStorage,
  formatMetadataFromStorage,
  downloadRemoteImage,
  readAttachmentImageMetrics,
} from "@/services/metadataStorage";
export {
  confrontWithDatabase,
  getDatabaseSuggestions,
} from "@/services/metadataDatabase";
export { getMetadataProviderAdapter } from "@/services/metadataResolvers";
export { cleanSearchQuery } from "@/services/metadataSearchUtils";
export { pickSSCover } from "@/services/providers/screenscraper";
export type { SSMedia } from "@/services/providers/screenscraper";
export type { BGGChild, BGGResponse } from "@/services/providers/bgg";

export async function getMetadata(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  try {
    const metadata = await fetchMetadataByType(name, type, barcode, platform);

    if (metadata && barcode) {
      const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
      if (cleanedBarcode) {
        const cached = await prisma.barcodeCache.findUnique({
          where: { barcode: cleanedBarcode },
          include: { rawNames: true },
        });

        if (cached) {
          const barcodeCover = cached.rawNames.find(
            (rn) => rn.coverUrl,
          )?.coverUrl;
          if (barcodeCover) {
            if (!metadata.attachments) {
              metadata.attachments = [];
            }
            const exists = metadata.attachments.some(
              (a) => a.url === barcodeCover,
            );
            if (!exists) {
              metadata.attachments.unshift({
                type: "cover" as AttachmentType,
                url: barcodeCover,
                source: "barcode",
              });
            }
          }
        }
      }
    }

    return metadata;
  } catch (err) {
    console.error("Failed to fetch metadata:", err);
    return null;
  }
}

export async function fetchAndStoreMetadata(
  itemId: Item["id"],
  name: Item["name"],
  type: Type,
  barcode?: string | null,
  forceRefresh = false,
  platform?: string | null,
): Promise<MetadataResult | null> {
  // Check if we should use cached metadata
  if (!forceRefresh) {
    const cachedMetadata = await getCachedMetadata(itemId);
    if (cachedMetadata) {
      return formatMetadataFromStorage(cachedMetadata);
    }
  }

  // Fetch new metadata using the name for lookup only
  const metadata = await getMetadata(name, type, barcode, platform);
  if (!metadata) return null;

  try {
    // Store the metadata without updating the item's name
    const storedMetadata = await storeMetadata(itemId, metadata, type, name);
    return formatMetadataFromStorage(storedMetadata);
  } catch (error) {
    console.error("Error storing metadata:", error);
    return null;
  }
}
