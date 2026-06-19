import type { NamedListing } from "@/lib/barcode/gameLookup";
import type { PriceChartingMetadata } from "@/services/providers/pricecharting/fetch";
import type { LeDenicheurPrices } from "@/services/providers/ledenicheur/fetch";

export type BarcodeMetadataHit = {
  title?: string;
  imageUrl?: string | null;
  aliases?: string[];
  platformKey?: string | null;
  regionalTitles?: Array<{ region?: string; text: string }>;
};

export type ScanDexLookup = {
  igdb_metadata?: {
    name?: string;
    platform?: { name?: string } | null;
  } | null;
} | null;

export type BarcodeLookupPayload = {
  ol: BarcodeMetadataHit | null;
  deezer: BarcodeMetadataHit | null;
  mb: BarcodeMetadataHit | null;
  discogs: BarcodeMetadataHit | null;
  ss: BarcodeMetadataHit | null;
  tmdb: BarcodeMetadataHit | null;
  pc: PriceChartingMetadata | null;
  sd: ScanDexLookup;
  amc: NamedListing[];
  calFr: NamedListing[];
  calDvd: NamedListing[];
  calMusic: NamedListing[];
  calToys: NamedListing[];
  calJeuxVideo: NamedListing[];
  calGeneric: NamedListing[];
  freakxy: NamedListing[];
  aprilo: NamedListing[];
  picclick: NamedListing[];
  leDenicheur: LeDenicheurPrices | null;
};

export function createEmptyBarcodeLookupPayload(): BarcodeLookupPayload {
  return {
    ol: null,
    deezer: null,
    mb: null,
    discogs: null,
    ss: null,
    tmdb: null,
    pc: null,
    sd: null,
    amc: [],
    calFr: [],
    calDvd: [],
    calMusic: [],
    calToys: [],
    calJeuxVideo: [],
    calGeneric: [],
    freakxy: [],
    aprilo: [],
    picclick: [],
    leDenicheur: null,
  };
}

export async function resolveSettledLookups(
  tasks: Record<string, Promise<unknown>>,
): Promise<Record<string, unknown>> {
  const entries = Object.entries(tasks);
  const settled = await Promise.allSettled(entries.map(([, task]) => task));
  return entries.reduce<Record<string, unknown>>((acc, [key], index) => {
    const result = settled[index];
    acc[key] = result?.status === "fulfilled" ? result.value : null;
    return acc;
  }, {});
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asMetadataHit(value: unknown): BarcodeMetadataHit | null {
  if (!value || typeof value !== "object") return null;
  const hit = value as BarcodeMetadataHit;
  return typeof hit.title === "string" && hit.title.trim() ? hit : null;
}

export function asPriceChartingHit(
  value: unknown,
): PriceChartingMetadata | null {
  if (!value || typeof value !== "object") return null;
  const hit = value as PriceChartingMetadata;
  return typeof hit.title === "string" && hit.title.trim() ? hit : null;
}

export function asScanDexHit(value: unknown): ScanDexLookup {
  if (!value || typeof value !== "object") return null;
  return value as ScanDexLookup;
}

export function asLeDenicheurHit(value: unknown): LeDenicheurPrices | null {
  if (!value || typeof value !== "object") return null;
  return value as LeDenicheurPrices;
}

export function asNamedListings(value: unknown): NamedListing[] {
  return asArray<NamedListing>(value).filter(
    (listing) => typeof listing?.name === "string" && listing.name.trim(),
  );
}
