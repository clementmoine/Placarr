/**
 * Sets that were never printed — Pokémon TCG Pocket.
 *
 * Placarr catalogues objects someone can hold. A Pocket print has a TCGdex
 * entry, a rarity and a price-less card face, but no copy of it exists on
 * cardboard, so offering one as something to add to a shelf is offering a
 * thing that cannot be owned.
 *
 * The set list is read from TCGdex's own serie rather than written down here:
 * Pocket ships a new set every few weeks, and a hardcoded list would quietly
 * start letting them through.
 */
import { httpGet } from "@/lib/http/httpClient";

import { API_BASE } from "./api";

/** TCGdex serie id for Pokémon TCG Pocket. */
export const DIGITAL_ONLY_SERIE = "tcgp";

type RawSerie = { sets?: { id?: unknown }[] };

let cached: Promise<ReadonlySet<string>> | null = null;

async function loadDigitalOnlySetIds(): Promise<ReadonlySet<string>> {
  const response = await httpGet<RawSerie>(
    `${API_BASE}/en/series/${DIGITAL_ONLY_SERIE}`,
    { timeout: 15_000 },
  );
  const ids = (response.data?.sets ?? [])
    .map((set) => (typeof set?.id === "string" ? set.id.toLowerCase() : null))
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) throw new Error("tcgdex: empty digital-only serie");
  return new Set(ids);
}

/**
 * Cached set ids. On a failed lookup the answer is "none": a search that shows
 * a Pocket print is a smaller problem than one that hides every physical card
 * because TCGdex was briefly unreachable.
 */
export async function digitalOnlySetIds(): Promise<ReadonlySet<string>> {
  cached ??= loadDigitalOnlySetIds().catch(() => {
    cached = null;
    return new Set<string>();
  });
  return cached;
}

export function __resetDigitalOnlyCacheForTests(): void {
  cached = null;
}

/** Skip the serie lookup so a test can keep mocking HTTP call by call. */
export function __seedDigitalOnlyCacheForTests(ids: readonly string[]): void {
  cached = Promise.resolve(new Set(ids.map((id) => id.toLowerCase())));
}

export async function isDigitalOnlySetId(setId: string): Promise<boolean> {
  return (await digitalOnlySetIds()).has(setId.toLowerCase());
}
