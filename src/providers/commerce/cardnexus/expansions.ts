/**
 * Expansion id lookup by set code (cached per CardNexus game).
 */

import { cardnexusGet } from "./client";
import type { CardnexusGameId } from "./games";

export type CardnexusExpansion = {
  id: number;
  code: string;
  name: string;
};

type ExpansionsPage = {
  data?: CardnexusExpansion[];
};

const cache = new Map<CardnexusGameId, Map<string, number>>();

function normCode(code: string): string {
  return code.trim().toLowerCase();
}

/**
 * Prefer exact code, else a unique `set-…` prefix
 * (pokemon `me05` → `me05-pitch-black`). Ambiguous prefixes → miss.
 */
export function matchExpansionId(
  expansions: ReadonlyMap<string, number>,
  setCode: string,
): number | null {
  const want = normCode(setCode);
  if (!want) return null;
  const exact = expansions.get(want);
  if (exact != null) return exact;
  const prefixed: number[] = [];
  for (const [code, id] of expansions) {
    if (code.startsWith(`${want}-`)) prefixed.push(id);
  }
  return prefixed.length === 1 ? prefixed[0]! : null;
}

export async function loadExpansionIndex(
  gameId: CardnexusGameId,
  opts?: { signal?: AbortSignal },
): Promise<Map<string, number>> {
  const hit = cache.get(gameId);
  if (hit) return hit;

  const page = await cardnexusGet<ExpansionsPage>(
    `/games/${encodeURIComponent(gameId)}/expansions`,
    opts,
  );
  const map = new Map<string, number>();
  for (const exp of page?.data ?? []) {
    if (typeof exp?.id !== "number" || !exp.code) continue;
    map.set(normCode(exp.code), exp.id);
  }
  cache.set(gameId, map);
  return map;
}

/** Test seam. */
export function clearExpansionCache(): void {
  cache.clear();
}
