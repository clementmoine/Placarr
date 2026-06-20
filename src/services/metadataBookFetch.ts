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
import { resolveMetadataProvidersInOrder } from "@/lib/metadataProviderQueue";
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

  const byProvider = await resolveMetadataProvidersInOrder(
    selectedProviderIds,
    { name, barcode, platform },
    metadataProviderResolverMap,
  );

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
