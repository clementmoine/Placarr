/**
 * Preferred Live prints confirmed owned in TCG Live.
 *
 * Ownership is server-side (not in MuMu app files). Source of truth for this
 * cache: Rainier `POST /commerce/v1/external/carddex/getCardDexData` → stems in
 * `liveOwned.json` (see `docs/pokemon_live_rainier.md`). Playroom prefers these
 * bundles over generic FOIL_SEEDS / dump order.
 */

import ownedJson from "./liveOwned.json";
import type { PokemonPaperFoilName } from "./foilNames";

export type LiveOwnedFile = {
  updatedAt?: string;
  source?: string;
  notes?: string;
  byEffect?: Partial<Record<string, string[]>>;
};

const FILE = ownedJson as LiveOwnedFile;

/** Bundle stems listed as owned for this Live foil leaf (may be empty). */
export function ownedBundlesForShader(
  shader: PokemonPaperFoilName | string,
): string[] {
  const raw = FILE.byEffect?.[shader];
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
  const by = FILE.byEffect ?? {};
  for (const list of Object.values(by)) {
    if (Array.isArray(list) && list.includes(id)) return true;
  }
  return false;
}
