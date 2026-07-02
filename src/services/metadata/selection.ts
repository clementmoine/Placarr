import {
  PROVIDER_MODULES,
  providersForType,
  type Capability,
  type MediaType,
  type ProviderInfo,
} from "@/services/provider/registry";
import { metadataProviderResolverMap } from "@/services/provider/bootstrap";
import { withProviderEvidence } from "@/services/metadata/facts";
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
    const metadata = await adapter.resolve({ type, name, barcode, platform });
    if (metadata) {
      return withProviderEvidence(metadata, provider.label);
    }
  }
  return null;
}

const METADATA_QUOTA_BLOCKED_BY_PROVIDER_ID = new Map(
  PROVIDER_MODULES.filter((module) => module.isMetadataQuotaBlocked).map(
    (module) => [module.info.id, module.isMetadataQuotaBlocked!],
  ),
);

export function isMetadataProviderQuotaBlocked(providerId: string): boolean {
  return METADATA_QUOTA_BLOCKED_BY_PROVIDER_ID.get(providerId)?.() ?? false;
}
