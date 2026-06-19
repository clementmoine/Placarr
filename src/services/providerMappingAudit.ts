import { getMetadataProviderAdapter } from "@/services/metadataResolvers";
import {
  getProviderModule,
  isProviderConfigured,
  PROVIDERS,
  type ProviderInfo,
} from "@/services/providerRegistry";
import {
  inferMappingProbeStatus,
  mergeMappingProbeRawKeys,
  metadataProbe,
  retry,
} from "@/lib/mappingProbeUtils";

import type {
  MappingProbeResult,
  MappingProbeStatus,
} from "@/types/providerModule";

export type { MappingProbeStatus } from "@/types/providerModule";

export interface ProviderMappingProbeEntry {
  providerId: string;
  label: string;
  status: MappingProbeStatus;
  sampleInput: string;
  mappedKeys: string[];
  unusedKeys: string[];
  attachmentsCount: number;
  factsCount: number;
  reason: string | null;
  example: string | null;
}

export interface ProviderMappingAuditPayload {
  generatedAt: string;
  probes: ProviderMappingProbeEntry[];
}

async function runMetadataAdapterProbe(
  providerId: string,
): Promise<MappingProbeResult | null> {
  const module = getProviderModule(providerId);
  const adapter = getMetadataProviderAdapter(providerId);
  const ctx = module?.mappingProbe?.context;
  if (!adapter || !ctx) return null;

  const resolve = () => adapter.resolve(ctx);
  const metadata =
    providerId === "googlebooks" ||
    providerId === "boardgamegeek" ||
    providerId === "openlibrary" ||
    providerId === "screenscraper"
      ? await retry(resolve, 2)
      : await resolve();
  return metadataProbe(metadata);
}

async function runProbe(
  providerId: string,
): Promise<MappingProbeResult | null> {
  const module = getProviderModule(providerId);
  if (module?.runMappingProbe) {
    return module.runMappingProbe();
  }
  if (getMetadataProviderAdapter(providerId)) {
    return runMetadataAdapterProbe(providerId);
  }
  return null;
}

export async function runProviderMappingAudit(): Promise<ProviderMappingAuditPayload> {
  const probes = await Promise.all(
    PROVIDERS.map(async (provider): Promise<ProviderMappingProbeEntry> => {
      const module = getProviderModule(provider.id);
      const sampleInput = module?.mappingProbe?.sampleInput || provider.id;

      if (
        provider.id === "googlebooks" &&
        !process.env.GOOGLE_BOOKS_API_KEY?.trim()
      ) {
        return blockedEntry(
          provider,
          sampleInput,
          "GOOGLE_BOOKS_API_KEY missing — free key via Google Cloud Console (Books API)",
        );
      }

      if (
        provider.id === "boardgamegeek" &&
        !process.env.BGG_API_TOKEN?.trim()
      ) {
        return blockedEntry(
          provider,
          sampleInput,
          "BGG_API_TOKEN missing — add it to .env (Bearer token from boardgamegeek.com/using_the_xml_api)",
        );
      }

      if (provider.auth.kind === "key" && !isProviderConfigured(provider)) {
        return blockedEntry(
          provider,
          sampleInput,
          `Missing env: ${provider.auth.env.join(", ")}`,
        );
      }

      try {
        const result = await runProbe(provider.id);
        const rawKeys = module?.collectMappingRawKeys
          ? await module.collectMappingRawKeys()
          : [];
        const mergedResult = mergeMappingProbeRawKeys(result, rawKeys);
        const status = inferMappingProbeStatus(mergedResult);

        return {
          providerId: provider.id,
          label: provider.label,
          status,
          sampleInput,
          mappedKeys: mergedResult?.mappedKeys || [],
          unusedKeys: mergedResult?.unusedKeys || [],
          attachmentsCount: mergedResult?.attachmentsCount || 0,
          factsCount: mergedResult?.factsCount || 0,
          reason:
            mergedResult?.reason ||
            (status === "empty" ? "No data for sample query" : null),
          example: mergedResult?.example || null,
        };
      } catch (error) {
        return {
          providerId: provider.id,
          label: provider.label,
          status: "error",
          sampleInput,
          mappedKeys: [],
          unusedKeys: [],
          attachmentsCount: 0,
          factsCount: 0,
          reason: error instanceof Error ? error.message : String(error),
          example: null,
        };
      }
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    probes,
  };
}

function blockedEntry(
  provider: ProviderInfo,
  sampleInput: string,
  reason: string,
): ProviderMappingProbeEntry {
  return {
    providerId: provider.id,
    label: provider.label,
    status: "blocked",
    sampleInput,
    mappedKeys: [],
    unusedKeys: [],
    attachmentsCount: 0,
    factsCount: 0,
    reason,
    example: null,
  };
}
