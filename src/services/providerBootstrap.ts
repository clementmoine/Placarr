import { wrapMetadataProviderAdapter } from "@/lib/metadataProviderQueue";
import { PROVIDER_MODULES } from "@/services/providerRegistry";

import type { MetadataResult } from "@/types/metadataProvider";
import type { MetadataProviderAdapter } from "@/types/providerModule";

export type MetadataAdapterDeps = {
  fetchFromScreenScraper: (
    name: string,
    barcode?: string | null,
    platform?: string | null,
  ) => Promise<MetadataResult | null>;
  fetchFromRawg: (name: string) => Promise<MetadataResult | null>;
  fetchFromDeezer: (
    name: string,
    barcode?: string | null,
  ) => Promise<MetadataResult | null>;
  fetchFromBGG: (name: string) => Promise<MetadataResult | null>;
  fetchFromOpenLibrary: (
    name: string,
    barcode?: string | null,
  ) => Promise<MetadataResult | null>;
  fetchFromGoogleBooks: (
    name: string,
    barcode?: string | null,
  ) => Promise<MetadataResult | null>;
  fetchFromWikidata: (name: string) => Promise<MetadataResult | null>;
  fetchFromPhilibert: (
    name: string,
    barcode?: string | null,
  ) => Promise<MetadataResult | null>;
  fetchFromMonsieurde: (
    name: string,
    barcode?: string | null,
  ) => Promise<MetadataResult | null>;
  fetchFromLudifolie: (
    name: string,
    barcode?: string | null,
  ) => Promise<MetadataResult | null>;
  fetchFromBcdjeux: (
    name: string,
    barcode?: string | null,
  ) => Promise<MetadataResult | null>;
  fetchFromLepassetemps: (
    name: string,
    barcode?: string | null,
  ) => Promise<MetadataResult | null>;
  fetchFromTMDB: (name: string) => Promise<MetadataResult | null>;
  fetchFromOMDb: (name: string) => Promise<MetadataResult | null>;
};

export function createMetadataAdapters(
  deps: MetadataAdapterDeps,
): MetadataProviderAdapter[] {
  return PROVIDER_MODULES.flatMap((module) => {
    if (!module.createMetadataAdapter) return [];
    const adapter = module.createMetadataAdapter(
      deps as unknown as Record<string, unknown>,
    );
    return adapter ? [adapter] : [];
  });
}

export function buildMetadataAdapterMap(
  deps: MetadataAdapterDeps,
): Map<string, MetadataProviderAdapter> {
  return new Map(
    createMetadataAdapters(deps).map((adapter) => [
      adapter.id,
      wrapMetadataProviderAdapter(adapter),
    ]),
  );
}

export function getMetadataProviderAdapterFromDeps(
  id: string,
  deps: MetadataAdapterDeps,
): MetadataProviderAdapter | undefined {
  return buildMetadataAdapterMap(deps).get(id);
}
