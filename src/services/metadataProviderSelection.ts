import {
  providersForType,
  type Capability,
  type MediaType,
  type ProviderInfo,
} from "@/services/providerRegistry";
import { metadataProviderResolverMap } from "@/services/metadataResolvers";
import { withProviderEvidence } from "@/services/metadataFacts";
import type { MetadataResult } from "@/types/metadataProvider";

const metadataSelectionCapabilities: Capability[] = [
  "identify",
  "description",
  "cover",
  "releaseDate",
  "rating",
  "ageRating",
  "people",
  "duration",
];

export function isPcLikeGamePlatform(platform?: string | null): boolean {
  if (!platform) return false;
  const normalized = platform
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(pc|windows|steam)\b/.test(normalized);
}

export function isMediaType(value: string): value is MediaType {
  return ["games", "movies", "musics", "books", "boardgames"].includes(value);
}

export function metadataCandidatesForType(type: MediaType): ProviderInfo[] {
  return providersForType(type)
    .filter(
      (provider) =>
        provider.canonical ||
        provider.capabilities.some((capability) =>
          metadataSelectionCapabilities.includes(capability),
        ),
    )
    .sort((a, b) => Number(b.canonical) - Number(a.canonical));
}

export function orderedProviderIdsForType(
  type: MediaType,
  preferredOrder: string[],
): string[] {
  const available = new Set(metadataCandidatesForType(type).map((p) => p.id));
  return preferredOrder.filter((id) => available.has(id));
}

export async function fetchFromRegistryMetadataResolvers(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  if (!isMediaType(type)) return null;
  for (const provider of metadataCandidatesForType(type)) {
    const adapter = metadataProviderResolverMap.get(provider.id);
    if (!adapter) continue;
    const metadata = await adapter.resolve({ name, barcode, platform });
    if (metadata) {
      return withProviderEvidence(metadata, provider.label);
    }
  }
  return null;
}
