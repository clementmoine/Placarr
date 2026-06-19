import { fetchFromAllBoardGameSources } from "@/services/metadataBoardGameFetch";
import { fetchFromAllBookSources } from "@/services/metadataBookFetch";
import { fetchFromAllGameSources } from "@/services/metadataGameFetch";
import { fetchFromAllMovieSources } from "@/services/metadataMovieFetch";
import { fetchFromAllMusicSources } from "@/services/metadataMusicFetch";
import { fetchFromRegistryMetadataResolvers } from "@/services/metadataProviderSelection";
import type { MetadataResult } from "@/types/metadataProvider";

export async function fetchMetadataByType(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  if (type === "games") {
    return fetchFromAllGameSources(name, barcode, platform);
  }
  if (type === "movies") {
    return fetchFromAllMovieSources(name, barcode, platform);
  }
  if (type === "musics") {
    return fetchFromAllMusicSources(name, barcode, platform);
  }
  if (type === "books") {
    return fetchFromAllBookSources(name, barcode, platform);
  }
  if (type === "boardgames") {
    return fetchFromAllBoardGameSources(name, barcode, platform);
  }
  return fetchFromRegistryMetadataResolvers(name, type, barcode, platform);
}
