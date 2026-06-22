import { fetchMetadata } from "@/services/metadataFetch";
import type { MetadataResult } from "@/types/metadataProvider";

export async function fetchFromAllGameSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
  options?: { isBackground?: boolean },
): Promise<MetadataResult | null> {
  return fetchMetadata(name, "games", barcode, platform, options);
}
