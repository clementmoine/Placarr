import {
  padVolumeNumbersInTitle,
  stripVolumeMarkersFromTitle,
  volumeNumberFromTitle,
} from "./volumeNumber";

/**
 * Series-aware display titles.
 *
 * A "series" is **earned by consensus, never guessed from one title**: it exists
 * only when at least two items share the same base title (volume markers stripped)
 * AND carry distinct volume numbers (`Super Picsou Géant n°36` + `… n°102`
 * → base `super picsou geant`, volumes {36, 102}). A lone numbered item — the
 * classic `Mighty No. 9`, where the 9 is part of the proper name — has nothing to
 * align against, so it stays exactly as its editorial title. This is what keeps us
 * out of confident false positives: no siblings, no series.
 *
 * For a real series the display volume number is zero-padded to the width of the
 * **largest** volume present, so a collection lines up on its own scale: a series
 * that tops out at 10 shows `01…10`, one that reaches 100 shows `001…100`.
 * Padding is align-to-widest (no floor): a series whose max is a single digit keeps
 * bare numbers. Each item keeps its own marker (`#`, `n°`, `Tome`…) — we only pad
 * the number, never rewrite the word, so the editorial display is preserved.
 *
 * This is a *display* projection. Stored names and slugs stay untouched (the slug
 * keeps its unpadded form), so the padding re-flows automatically as higher
 * volumes are added — nothing to migrate.
 */

/**
 * Minimum distinct volumes for a base title to count as a series. Below this there
 * is nothing to align, and a single numbered title must never be coerced into a
 * "volume" (e.g. `Mighty No. 9`).
 */
export const MIN_SERIES_VOLUMES = 2;

/** Stable grouping key for items of the same series (volume markers removed). */
export function seriesBaseKey(title: string): string {
  return stripVolumeMarkersFromTitle(title);
}

/** Align-to-widest display width = digit count of the largest volume. */
export function seriesVolumeDisplayWidth(maxVolume: number): number {
  return String(Math.max(1, Math.trunc(maxVolume))).length;
}

export interface SeriesTitleEntry {
  id: string;
  title: string;
}

/**
 * Largest volume number per *qualifying* series base key — i.e. keys with at least
 * `MIN_SERIES_VOLUMES` distinct volumes across the given entries. Lone numbered
 * titles never appear here, so they stay untouched at display time.
 */
export function seriesMaxVolumeByKey(
  entries: SeriesTitleEntry[],
): Map<string, number> {
  const volumesByKey = new Map<string, Set<number>>();
  for (const entry of entries) {
    const volume = volumeNumberFromTitle(entry.title);
    if (volume === null) continue;
    const key = seriesBaseKey(entry.title);
    if (!key) continue;
    const parsed = Number.parseInt(volume, 10);
    if (!Number.isFinite(parsed)) continue;
    const volumes = volumesByKey.get(key) ?? new Set<number>();
    volumes.add(parsed);
    volumesByKey.set(key, volumes);
  }

  const maxByKey = new Map<string, number>();
  for (const [key, volumes] of volumesByKey) {
    if (volumes.size < MIN_SERIES_VOLUMES) continue;
    maxByKey.set(key, Math.max(...volumes));
  }
  return maxByKey;
}

/**
 * Maps each entry id to its series-aware display title. Entries whose series has
 * no detected volume (e.g. games, standalone items) are returned unchanged.
 */
export function seriesDisplayTitles(
  entries: SeriesTitleEntry[],
): Map<string, string> {
  const maxByKey = seriesMaxVolumeByKey(entries);
  const display = new Map<string, string>();
  for (const entry of entries) {
    const max = maxByKey.get(seriesBaseKey(entry.title));
    if (max === undefined) {
      display.set(entry.id, entry.title);
      continue;
    }
    display.set(
      entry.id,
      padVolumeNumbersInTitle(entry.title, seriesVolumeDisplayWidth(max)),
    );
  }
  return display;
}

/**
 * Items belonging to the same series as `title` (same base key, each carrying a
 * volume marker), sorted by ascending volume. Powers the "other volumes in this
 * series" list on the item page. Honors the consensus rule: returns `[]` unless the
 * base key reaches `MIN_SERIES_VOLUMES` distinct volumes, so a lone numbered title
 * never renders a phantom series.
 */
export function seriesSiblings<T extends SeriesTitleEntry>(
  title: string,
  entries: T[],
): T[] {
  const key = seriesBaseKey(title);
  if (!key) return [];

  const members = entries
    .filter(
      (entry) =>
        seriesBaseKey(entry.title) === key &&
        volumeNumberFromTitle(entry.title) !== null,
    )
    .sort((a, b) => {
      const va = Number.parseInt(volumeNumberFromTitle(a.title) ?? "0", 10);
      const vb = Number.parseInt(volumeNumberFromTitle(b.title) ?? "0", 10);
      return va - vb;
    });

  const distinctVolumes = new Set(
    members.map((entry) =>
      Number.parseInt(volumeNumberFromTitle(entry.title) ?? "0", 10),
    ),
  );
  if (distinctVolumes.size < MIN_SERIES_VOLUMES) return [];

  return members;
}
