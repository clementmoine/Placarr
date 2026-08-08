/**
 * Live std/ph foil rows that TCGdex finishes cannot reach.
 *
 * Catalogue finishes map one-to-many: `holo` prefers foil std, `reverse` → ph.
 * When both Live rows are foil (and differ), one side is often unreachable —
 * e.g. holo-only TCGdex never selects the reverse Live shader. Synthetic
 * finishes (`live-std` / `live-ph`) expose those rows on PrintCandidate.
 */

import {
  isPaperFoilVariant,
  pickPaperVariant,
  type PaperCardEntry,
} from "./resolveEffect";

export const LIVE_STD_FINISH = "live-std";
export const LIVE_PH_FINISH = "live-ph";

const SYNTHETIC: Readonly<Record<"std" | "ph", string>> = {
  std: LIVE_STD_FINISH,
  ph: LIVE_PH_FINISH,
};

export function isLiveSyntheticFinish(finish: string): boolean {
  const n = finish.trim().toLowerCase();
  return n === LIVE_STD_FINISH || n === LIVE_PH_FINISH;
}

export function liveKeyForSyntheticFinish(
  finish: string,
): "std" | "ph" | null {
  const n = finish.trim().toLowerCase();
  if (n === LIVE_STD_FINISH) return "std";
  if (n === LIVE_PH_FINISH) return "ph";
  return null;
}

export function syntheticFinishForLiveKey(key: "std" | "ph"): string {
  return SYNTHETIC[key];
}

/** Live foil keys already selected by any non-synthetic catalogue finish. */
export function coveredLiveKeys(
  entry: PaperCardEntry,
  finishes: readonly string[],
): Set<"std" | "ph"> {
  const covered = new Set<"std" | "ph">();
  for (const finish of finishes) {
    if (isLiveSyntheticFinish(finish)) continue;
    const picked = pickPaperVariant(entry, finish);
    if (picked) covered.add(picked.key);
  }
  return covered;
}

/** Foil Live keys with no catalogue finish that selects them. */
export function unreachableLiveKeys(
  entry: PaperCardEntry,
  finishes: readonly string[],
): Array<"std" | "ph"> {
  const covered = coveredLiveKeys(entry, finishes);
  const out: Array<"std" | "ph"> = [];
  for (const key of ["std", "ph"] as const) {
    if (!isPaperFoilVariant(entry[key])) continue;
    if (!covered.has(key)) out.push(key);
  }
  return out;
}

/**
 * Append synthetic finishes for unreachable Live foil rows.
 * Does not mutate `finishes` when every foil key is already covered.
 */
export function appendUnreachableLiveFinishes(
  finishes: readonly string[],
  entry: PaperCardEntry | null | undefined,
): string[] {
  if (!entry) return [...finishes];
  const next = [...finishes];
  const present = new Set(next.map((f) => f.trim().toLowerCase()));
  for (const key of unreachableLiveKeys(entry, finishes)) {
    const id = syntheticFinishForLiveKey(key);
    if (present.has(id)) continue;
    next.push(id);
    present.add(id);
  }
  return next;
}
