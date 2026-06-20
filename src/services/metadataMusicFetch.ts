import { AttachmentType } from "@prisma/client";
import {
  pickBestDisplayImageUrl,
  rankAttachmentsForDisplay,
} from "@/lib/attachmentDisplayScore";
import {
  dedupeFacts,
  dedupeFieldEvidence,
  metadataFieldEvidence,
} from "@/services/metadataFacts";
import {
  mergeMusicMetadata,
  preferRequestedDisplayTitle,
} from "@/services/metadataMerge";
import { orderedProviderIdsForType } from "@/services/metadataProviderSelection";
import { resolveMetadataProvidersInOrder } from "@/lib/metadataProviderQueue";
import { metadataProviderResolverMap } from "@/services/metadataResolvers";
import type { MetadataResult } from "@/types/metadataProvider";

export async function fetchFromAllMusicSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  const musicProviderOrder = ["musicbrainz", "discogs", "deezer"];
  const selectedProviderIds = orderedProviderIdsForType(
    "musics",
    musicProviderOrder,
  );

  const byProvider = await resolveMetadataProvidersInOrder(
    selectedProviderIds,
    { name, barcode, platform },
    metadataProviderResolverMap,
  );

  const musicbrainz = byProvider.get("musicbrainz") || null;
  const discogs = byProvider.get("discogs") || null;
  const deezer = byProvider.get("deezer") || null;

  if (!musicbrainz && !discogs && !deezer) {
    return null;
  }

  const merged = mergeMusicMetadata(musicbrainz, discogs, deezer);
  const mergedWithEvidence: MetadataResult = {
    ...merged,
    fieldEvidence: dedupeFieldEvidence([
      ...metadataFieldEvidence("MusicBrainz", musicbrainz),
      ...metadataFieldEvidence("Discogs", discogs),
      ...metadataFieldEvidence("Deezer", deezer),
      ...metadataFieldEvidence("MergedEngine", merged, {
        confidence: 0.78,
        priority: 190,
      }),
    ]),
  };

  return preferRequestedDisplayTitle(mergedWithEvidence, name);
}
