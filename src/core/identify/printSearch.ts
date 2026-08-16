/**
 * Print search — the entry point for shelves that cannot be scanned.
 *
 * Everywhere else identification starts from a barcode. Trading cards have
 * none, so the user searches by name and picks a *printing*: a title alone is
 * not an answer, since five Lorcana prints share the name "Chiot dalmatien".
 *
 * Core stays provider-blind: it asks every module registered for the media type
 * that implements `searchPrints`, and merges. A second game (Pokémon, Magic)
 * plugs in by declaring the capability, with nothing to change here.
 */
import { PROVIDER_MODULES } from "@/core/catalog/registry";
import { parsePrintKey } from "@/core/identify/printKey";
import { isAbortError } from "@/lib/http/abort";

import type { PrintCandidate } from "@/types/providerModule";

const DEFAULT_LIMIT = 24;

/** Per-provider ceiling, so one chatty source cannot crowd the others out. */
const PER_PROVIDER_LIMIT = 24;

export type PrintSearchOptions = {
  language?: string | null;
  limit?: number;
  signal?: AbortSignal;
};

function providersFor(type: string) {
  return PROVIDER_MODULES.filter(
    (module) =>
      typeof module.searchPrints === "function" &&
      module.info.types.some((mediaType) => mediaType === type),
  );
}

/**
 * One printing by key, from whichever provider owns that game. Asked live
 * rather than read from storage: what a print exists as belongs to the
 * provider, and a persisted copy would drift as sets get corrected.
 */
export async function lookupPrintCandidate(
  printKey: string,
  type: string,
  options: PrintSearchOptions & { name?: string | null } = {},
): Promise<PrintCandidate | null> {
  const key = printKey?.trim();
  if (!key || !parsePrintKey(key)) return null;

  for (const provider of PROVIDER_MODULES) {
    if (typeof provider.lookupPrint !== "function") continue;
    if (!provider.info.types.some((mediaType) => mediaType === type)) continue;
    try {
      const found = await provider.lookupPrint({
        printKey: key,
        name: options.name,
        language: options.language,
        signal: options.signal,
      });
      if (found) return { ...found, providerId: provider.info.id };
    } catch (error) {
      // Client navigated away / HMR killed the batch — not a provider fault.
      if (isAbortError(error) || options.signal?.aborted) throw error;
      // One provider failing must not hide a print another one could resolve.
      console.warn(
        `[lookupPrintCandidate] ${provider.info.id} failed for "${key}":`,
        error,
      );
    }
  }
  return null;
}

/** Whether any provider can answer a print search for this media type. */
export function supportsPrintSearch(type: string): boolean {
  return providersFor(type).length > 0;
}

/**
 * Merged, de-duplicated candidates. A malformed or missing print key drops the
 * row: a candidate the app could not re-resolve later is worse than one result
 * fewer.
 */
export async function searchPrintCandidates(
  query: string,
  type: string,
  options: PrintSearchOptions = {},
): Promise<PrintCandidate[]> {
  const trimmed = query?.trim();
  if (!trimmed) return [];

  const modules = providersFor(type);
  if (modules.length === 0) return [];

  const settled = await Promise.allSettled(
    modules.map(async (module) => {
      const found = await module.searchPrints!({
        query: trimmed,
        language: options.language,
        limit: PER_PROVIDER_LIMIT,
        signal: options.signal,
      });
      return found.map((candidate) => ({
        ...candidate,
        providerId: module.info.id,
      }));
    }),
  );

  const merged: PrintCandidate[] = [];
  const seen = new Set<string>();

  for (const [position, result] of settled.entries()) {
    if (result.status === "rejected") {
      // One provider failing must not empty the list the user is looking at.
      console.warn(
        `[searchPrintCandidates] ${modules[position]?.info.id} failed for "${trimmed}":`,
        result.reason,
      );
      continue;
    }

    for (const candidate of result.value) {
      if (!parsePrintKey(candidate.printKey)) continue;
      const key = `${candidate.printKey}|${candidate.language ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(candidate);
    }
  }

  return merged.slice(0, options.limit ?? DEFAULT_LIMIT);
}

/**
 * Reverse of `slugifyItemName("TFC#002")` → `tfc-2` (and `PR3#34` → `pr3-34`).
 * Used so bookmarks to the pre-enrichment URL still resolve after the catalog
 * title rewrites the slug.
 */
export function collectorQueryFromItemSlug(slug: string): string | null {
  const match = slug.trim().match(/^([a-z][a-z0-9]*)-(\d+[a-z]?)$/i);
  if (!match) return null;
  return `${match[1]!.toUpperCase()}#${match[2]}`;
}

/** Promo tokens collectors type (`P3`, `PR3`) — not a card title. */
function queryPromoGrouping(query: string): string | null {
  const match = query.match(/\bpr?(\d+)\b/i);
  return match ? `p${match[1]}` : null;
}

function printNumberIdentity(printKey: string): string | null {
  const identity = parsePrintKey(printKey);
  if (!identity) return null;
  return `${identity.game}|${identity.set}|${identity.number}`;
}

/**
 * Resolve a pasted line to a single printing when the query is unambiguous.
 *
 * Used by bulk add: `TFC#001` is a lookup code, not a display name. Ambiguous
 * names (`elsa`, `premier chapitre`, twin promos) stay unresolved so we never
 * invent a print the collector did not pick.
 */
export async function resolveUniquePrintCandidate(
  query: string,
  type: string,
  options: PrintSearchOptions = {},
): Promise<PrintCandidate | null> {
  const found = await searchPrintCandidates(query, type, {
    ...options,
    limit: options.limit ?? PER_PROVIDER_LIMIT,
  });
  if (found.length === 0) return null;

  const byKey = new Map<string, PrintCandidate>();
  for (const candidate of found) {
    if (!byKey.has(candidate.printKey)) {
      byKey.set(candidate.printKey, candidate);
    }
  }
  if (byKey.size === 1) return byKey.values().next().value ?? null;

  const wantedPromo = queryPromoGrouping(query);
  if (wantedPromo) {
    const promoHits = [...byKey.values()].filter(
      (candidate) =>
        parsePrintKey(candidate.printKey)?.grouping === wantedPromo,
    );
    if (promoHits.length === 1) return promoHits[0]!;
    return null;
  }

  // `TFC#20` hits both the base print and `20/P1`. Prefer the base when the
  // query did not ask for a promo group and every hit shares set + number.
  const identities = [...byKey.keys()].map(printNumberIdentity);
  if (identities.some((id) => id == null)) return null;
  if (new Set(identities).size !== 1) return null;

  const base = [...byKey.values()].find(
    (candidate) => !parsePrintKey(candidate.printKey)?.grouping,
  );
  return base ?? null;
}
