import { fetchMetadata } from "@/services/metadata/fetch";
import type { MetadataResult } from "@/types/metadataProvider";

export async function fetchFromAllBookSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  return fetchMetadata(name, "books", barcode, platform);
}

export async function fetchFromAllGameSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
  options?: { isBackground?: boolean },
): Promise<MetadataResult | null> {
  return fetchMetadata(name, "games", barcode, platform, options);
}

export async function fetchFromAllMovieSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  return fetchMetadata(name, "movies", barcode, platform);
}

export async function fetchFromAllMusicSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  return fetchMetadata(name, "musics", barcode, platform);
}

export async function fetchFromAllBoardGameSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  return fetchMetadata(name, "boardgames", barcode, platform);
}
