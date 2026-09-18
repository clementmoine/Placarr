import type { NamedListing } from "@/core/identify/gameLookup";
import type {
  CollectorCatalogBarcodeHit,
  LeDenicheurPrices,
  PriceChartingMetadata,
} from "@/core/identify/lookup/providerTypes";
import { scrapeCatalogRetailerLookupEntries } from "@/core/catalog/scrapeRetailers";
import { detectPlatformKey } from "@/core/identify/query";
import type { MediaType } from "@/types/providerRegistry";

export type BarcodeMetadataHit = {
  title?: string;
  imageUrl?: string | null;
  aliases?: string[];
  platformKey?: string | null;
  regionalTitles?: Array<{ region?: string; text: string }>;
  /** Absolute product fiche URL when the barcode scrape already resolved one. */
  productUrl?: string | null;
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

/**
 * Barcode lookup slots. Core declares only what it owns across providers;
 * every provider-specific slot is added by that provider's module through
 * `declare module` augmentation, so adding a provider never edits this file.
 */
export interface BarcodeLookupSlots {
  ol: BarcodeMetadataHit | null;
  mb: BarcodeMetadataHit | null;
  ss: BarcodeMetadataHit | null;
  pc: PriceChartingMetadata | null;
  sd: ScanDexLookup;
  retailers: RetailerBarcodeHit[];
  amc: NamedListing[];
  calFr: NamedListing[];
  calDvd: NamedListing[];
  calMusic: NamedListing[];
  calToys: NamedListing[];
  calJeuxVideo: NamedListing[];
  calGeneric: NamedListing[];
  leDenicheur: LeDenicheurPrices | null;
  ice: CollectorCatalogBarcodeHit | null;
}

export type BarcodeLookupPayload = BarcodeLookupSlots;

/**
 * Empty value per slot. A mapped type over the augmented interface: a provider
 * that declares a slot without supplying its default fails to compile at the
 * call site, instead of leaving an `undefined` behind a type that promises a
 * value.
 */
export type BarcodeLookupSlotDefaults = {
  [K in keyof BarcodeLookupSlots]: () => BarcodeLookupSlots[K];
};

/**
 * Build an empty payload from the slot defaults. The defaults come from the
 * caller that owns the registry (`barcodeLookupSlotDefaults()`), which is what
 * makes a missing slot a compile error rather than a runtime `undefined`.
 */
export function createEmptyBarcodeLookupPayload(
  defaults: BarcodeLookupSlotDefaults,
): BarcodeLookupPayload {
  const payload = {} as Record<string, unknown>;
  for (const [key, empty] of Object.entries(defaults)) {
    payload[key] = (empty as () => unknown)();
  }
  return payload as unknown as BarcodeLookupPayload;
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
  return Number.isFinite(parsed)
    ? parsed
    : DEFAULT_BARCODE_LOOKUP_TASK_DEADLINE_MS;
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

export function asICollectHit(
  value: unknown,
): CollectorCatalogBarcodeHit | null {
  if (!value || typeof value !== "object") return null;
  const hit = value as CollectorCatalogBarcodeHit;
  return typeof hit.title === "string" && hit.title.trim() ? hit : null;
}

/** Drop cross-generation collector hits; keep a title hint for PC fallback. */
export function catalogIceBarcodeHit(
  hit: CollectorCatalogBarcodeHit | null,
  contextPlatformKey: string | null,
): {
  ice: CollectorCatalogBarcodeHit | null;
  catalogTitleHint: string | null;
} {
  if (!hit?.title) return { ice: null, catalogTitleHint: null };

  const catalogPlatformKey = hit.platform
    ? detectPlatformKey(String(hit.platform))
    : null;
  const platformConflict =
    contextPlatformKey &&
    catalogPlatformKey &&
    catalogPlatformKey !== contextPlatformKey;

  if (!platformConflict) {
    return { ice: hit, catalogTitleHint: null };
  }

  const catalogTitleHint = hit.title
    .replace(/\s*\|\s*HD\b.*$/i, "")
    .replace(/\s*\|+\s*$/g, "")
    .trim();

  return {
    ice: null,
    catalogTitleHint: catalogTitleHint || null,
  };
}

export function asNamedListings(value: unknown): NamedListing[] {
  return asArray<NamedListing>(value).filter(
    (listing) => typeof listing?.name === "string" && listing.name.trim(),
  );
}

export type RetailerBarcodeHit = BarcodeMetadataHit & {
  providerId: string;
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
    return [
      {
        ...hit,
        providerId: entry.lookupKey,
        providerName: entry.providerName,
        types: entry.types,
      },
    ];
  });
}
