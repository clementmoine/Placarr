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
