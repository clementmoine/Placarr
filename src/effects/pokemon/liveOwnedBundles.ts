/**
 * Preferred Live prints confirmed owned in TCG Live.
 *
 * Ownership is server-side. Source: Rainier carddex → `data/pokemon/liveOwned.json`.
 */

import { loadLiveOwned } from "@/lib/foilMetaLoad";

import type { PokemonPaperFoilName } from "./foilNames";

export type LiveOwnedFile = {
  updatedAt?: string;
  source?: string;
  notes?: string;
  byEffect?: Partial<Record<string, string[]>>;
};

function ownedFile(): LiveOwnedFile {
  return loadLiveOwned() as LiveOwnedFile;
}

/** Bundle stems listed as owned for this Live foil leaf (may be empty). */
export function ownedBundlesForShader(
  shader: PokemonPaperFoilName | string,
): string[] {
  const raw = ownedFile().byEffect?.[shader];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    const stem = typeof id === "string" ? id.trim() : "";
    if (!stem || seen.has(stem)) continue;
    seen.add(stem);
    out.push(stem);
  }
  return out;
}

/** True when this bundle is listed under any effect (or the given one). */
export function isOwnedPlayroomBundle(
  bundleId: string,
  shader?: PokemonPaperFoilName | string,
): boolean {
  const id = bundleId.trim();
  if (!id) return false;
  if (shader) return ownedBundlesForShader(shader).includes(id);
  const by = ownedFile().byEffect ?? {};
  for (const list of Object.values(by)) {
    if (Array.isArray(list) && list.includes(id)) return true;
  }
  return false;
}
