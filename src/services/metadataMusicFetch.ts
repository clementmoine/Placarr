import { fetchMetadata } from "@/services/metadataFetch";
import type { MetadataResult } from "@/types/metadataProvider";

export async function fetchFromAllMusicSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  return fetchMetadata(name, "musics", barcode, platform);
}
