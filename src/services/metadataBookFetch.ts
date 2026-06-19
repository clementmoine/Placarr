import { AttachmentType } from "@prisma/client";
import {
  pickBestDisplayImageUrl,
  rankAttachmentsForDisplay,
} from "@/lib/attachmentDisplayScore";
import {
  dedupeFieldEvidence,
  metadataFieldEvidence,
} from "@/services/metadataFacts";
import {
  mergeBookMetadata,
  preferRequestedDisplayTitle,
} from "@/services/metadataMerge";
import { orderedProviderIdsForType } from "@/services/metadataProviderSelection";
import { metadataProviderResolverMap } from "@/services/metadataResolvers";
import type { MetadataResult } from "@/types/metadataProvider";

export async function fetchFromAllBookSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  const bookProviderOrder = ["openlibrary", "googlebooks"];
  const selectedProviderIds = orderedProviderIdsForType(
    "books",
    bookProviderOrder,
  );

  const settled = await Promise.allSettled(
    selectedProviderIds.map(async (providerId) => ({
      providerId,
      value: await metadataProviderResolverMap
        .get(providerId)
        ?.resolve({ name, barcode, platform }),
    })),
  );

  const byProvider = new Map<string, MetadataResult | null>();
  for (const item of settled) {
    if (item.status !== "fulfilled") continue;
    byProvider.set(item.value.providerId, item.value.value || null);
  }

  const openlibrary = byProvider.get("openlibrary") || null;
  const googlebooks = byProvider.get("googlebooks") || null;

  if (!openlibrary && !googlebooks) {
    return null;
  }

  const merged = mergeBookMetadata(openlibrary, googlebooks);
  const mergedWithEvidence: MetadataResult = {
    ...merged,
    fieldEvidence: dedupeFieldEvidence([
      ...metadataFieldEvidence("OpenLibrary", openlibrary),
      ...metadataFieldEvidence("Google Books", googlebooks),
      ...metadataFieldEvidence("MergedEngine", merged, {
        confidence: 0.78,
        priority: 190,
      }),
    ]),
  };

  return preferRequestedDisplayTitle(mergedWithEvidence, name);
}
