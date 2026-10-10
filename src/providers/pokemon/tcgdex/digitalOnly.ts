/**
 * Sets that do not belong on a Placarr cardboard shelf.
 *
 * - **tcgp** — Pokémon TCG Pocket: never printed.
 * - **misc** — TCGdex « Autre » (today: Cartes Jumbo): oversized promos whose
 *   faces already exist on the matching standard print. Harvesting them would
 *   duplicate art; listing them as « Sans catalogue » is a false gap.
 *
 * Serie membership is read from TCGdex rather than written down here: Pocket
 * ships often, and misc may grow, without us editing a magic id list.
 */
import { httpGet } from "@/lib/http/httpClient";

const API_BASE = "https://api.tcgdex.net/v2";

/** TCGdex serie ids whose sets we never catalogue. */
export const EXCLUDED_CATALOGUE_SERIES = ["tcgp", "misc"] as const;

/** @deprecated Prefer {@link EXCLUDED_CATALOGUE_SERIES}; Pocket was the first. */
export const DIGITAL_ONLY_SERIE = "tcgp";

type RawSerie = { sets?: { id?: unknown }[] };

let cached: Promise<ReadonlySet<string>> | null = null;

async function loadExcludedSetIds(): Promise<ReadonlySet<string>> {
  const batches = await Promise.all(
    EXCLUDED_CATALOGUE_SERIES.map(async (serie) => {
      try {
        const response = await httpGet<RawSerie>(
          `${API_BASE}/en/series/${serie}`,
          { timeout: 15_000 },
        );
        return (response.data?.sets ?? [])
          .map((set) =>
            typeof set?.id === "string" ? set.id.toLowerCase() : null,
          )
          .filter((id): id is string => Boolean(id));
      } catch {
        return [] as string[];
      }
    }),
  );
  const ids = batches.flat();
  if (ids.length === 0) {
    throw new Error("tcgdex: empty excluded-catalogue series");
  }
  return new Set(ids);
}

/**
 * Cached set ids. On a failed lookup the answer is "none": a search that shows
 * a Pocket print is a smaller problem than one that hides every physical card
 * because TCGdex was briefly unreachable.
 */
export async function digitalOnlySetIds(): Promise<ReadonlySet<string>> {
  cached ??= loadExcludedSetIds().catch(() => {
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
