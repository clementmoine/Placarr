import type { NamedListing } from "@/lib/barcode/gameLookup";
import type {
  LeDenicheurPrices,
  PriceChartingMetadata,
} from "@/lib/barcode/lookup/providerTypes";
import type { ICollectMetadata } from "@/services/providers/icollect/fetch";
import { scrapeCatalogRetailerLookupEntries } from "@/services/provider/scrapeRetailers";
import type { MediaType } from "@/types/providerRegistry";

export type BarcodeMetadataHit = {
  title?: string;
  imageUrl?: string | null;
  aliases?: string[];
  platformKey?: string | null;
  regionalTitles?: Array<{ region?: string; text: string }>;
  /** New-price (cents) captured in the same lookup, when the source is a retailer (e.g. Philibert). */
  priceCents?: number | null;
  players?: string | null;
  playtime?: string | null;
  ageRating?: string | null;
  mediaFormat?: string | null;
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
  philibert: BarcodeMetadataHit | null;
  okkazeo: BarcodeMetadataHit | null;
  retailers: RetailerBarcodeHit[];
  amc: NamedListing[];
  calFr: NamedListing[];
  calDvd: NamedListing[];
  calMusic: NamedListing[];
  calToys: NamedListing[];
  calJeuxVideo: NamedListing[];
  calGeneric: NamedListing[];
  freakxy: NamedListing[];
  picclick: NamedListing[];
  ebay: NamedListing[];
  leDenicheur: LeDenicheurPrices | null;
  ice: ICollectMetadata | null;
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
    philibert: null,
    okkazeo: null,
    retailers: [],
    amc: [],
    calFr: [],
    calDvd: [],
    calMusic: [],
    calToys: [],
    calJeuxVideo: [],
    calGeneric: [],
    freakxy: [],
    picclick: [],
    ebay: [],
    leDenicheur: null,
    ice: null,
  };
}

export const DEFAULT_BARCODE_LOOKUP_TASK_DEADLINE_MS = 8000;

/**
 * Soft cap (ms) for a single barcode lookup task. The batch waits for the
 * slowest provider, so a provider that chains round-trips (e.g. a marketplace
 * search + detail fetch, each with its own request timeout) can hold every scan
 * hostage well past any single request timeout. This caps that tail
 * provider-blind: a task that overruns yields `null` instead of stalling the
 * batch. Tunable via env; `0`/invalid disables the cap. Read at call-time so it
 * can be tuned without a rebuild.
 */
export function barcodeLookupTaskDeadlineMs(): number {
  const raw = process.env.BARCODE_LOOKUP_TASK_DEADLINE_MS;
  if (raw === undefined) return DEFAULT_BARCODE_LOOKUP_TASK_DEADLINE_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_BARCODE_LOOKUP_TASK_DEADLINE_MS;
}

export function withBarcodeLookupDeadline<T>(
  task: Promise<T>,
  ms: number = barcodeLookupTaskDeadlineMs(),
): Promise<T | null> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return task.catch(() => null);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
    timer.unref?.();
  });
  const guarded = task.then(
    (value) => {
      if (timer) clearTimeout(timer);
      return value as T | null;
    },
    () => {
      if (timer) clearTimeout(timer);
      return null;
    },
  );
  return Promise.race([guarded, deadline]);
}

export async function resolveSettledLookups(
  tasks: Record<string, Promise<unknown>>,
): Promise<Record<string, unknown>> {
  const entries = Object.entries(tasks);
  const settled = await Promise.allSettled(
    entries.map(([, task]) => withBarcodeLookupDeadline(task)),
  );
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

export type RetailerBarcodeHit = BarcodeMetadataHit & {
  providerName: string;
  types: MediaType[];
};

/**
 * Collect barcode hits from the PrestaShop-family retailers, each tagged with its
 * shop's declared media types so the evidence assembly routes it to the right
 * bucket (a games shop → game sources, a board-game shop → board-game sources).
 * Derived from the configs — no hardcoded retailer list.
 */
export function collectRetailerBarcodeHits(
  lookups: Record<string, unknown>,
): RetailerBarcodeHit[] {
  return scrapeCatalogRetailerLookupEntries().flatMap((entry) => {
    const hit = asMetadataHit(lookups[entry.lookupKey]);
    if (!hit?.title) return [];
    return [{ ...hit, providerName: entry.providerName, types: entry.types }];
  });
}
