import type {
  MetadataAdapterContext,
  ProviderMappingProbeContext,
} from "@/types/providerModule";

import {
  collectCapabilityExpectedSignals,
  collectObjectMappingSignals,
  mergeMappingSignalSets,
} from "./scrapeMappingSignals";

export type MappingRawKeysFetcher = (
  context?: ProviderMappingProbeContext,
) => Promise<unknown>;

export async function mappingRawKeysFromFetch(
  fetcher: () => Promise<unknown>,
): Promise<string[]> {
  try {
    const value = await fetcher();
    if (Array.isArray(value)) {
      return mergeMappingSignalSets(
        ...value.slice(0, 3).map((entry) => collectObjectMappingSignals(entry)),
      );
    }
    return collectObjectMappingSignals(value);
  } catch {
    return [];
  }
}

export function createMappingRawKeysCollector(
  fetchSource: MappingRawKeysFetcher,
  toSignals: (source: unknown) => string[],
): (context?: ProviderMappingProbeContext) => Promise<string[]> {
  return async (context) => {
    try {
      const source = await fetchSource(context);
      if (source == null) return [];
      return toSignals(source);
    } catch {
      return [];
    }
  };
}

export function signalsFromObjectSource(source: unknown): string[] {
  if (source == null) return [];
  if (typeof source === "string") return [];
  return collectObjectMappingSignals(source);
}

export function signalsFromObjectAndCapabilities(
  source: unknown,
  capabilities: string[] = [],
): string[] {
  return mergeMappingSignalSets(
    collectCapabilityExpectedSignals(capabilities as never[]),
    collectObjectMappingSignals(source),
  );
}

export function probeContextOrDefault(
  context: ProviderMappingProbeContext | undefined,
  fallback: MetadataAdapterContext,
): MetadataAdapterContext {
  return {
    ...fallback,
    ...context,
    name: context?.name?.trim() || fallback.name,
    barcode: context?.barcode ?? fallback.barcode,
    platform: context?.platform ?? fallback.platform,
  };
}
