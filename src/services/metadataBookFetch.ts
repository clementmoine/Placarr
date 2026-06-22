import { fetchMetadata } from "@/services/metadataFetch";
import type { MetadataResult } from "@/types/metadataProvider";

export async function fetchFromAllBookSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  return fetchMetadata(name, "books", barcode, platform);
}
