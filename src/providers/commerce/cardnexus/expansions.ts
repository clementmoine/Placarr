/**
 * Expansion id lookup by set code (cached per CardNexus game).
 *
 * Catalogue pages are offset-paginated (`pagination.hasMore`) — a single GET
 * only returns the first page (~50–100), which silently drops modern JA sets.
 */

import { cardnexusGet } from "./client";
import type { CardnexusGameId } from "./games";

export type CardnexusExpansion = {
  id: number;
  code: string;
  name: string;
  cardCount?: number;
  sealedProductCount?: number;
};

type ExpansionsPage = {
  data?: CardnexusExpansion[];
  pagination?: {
    offset?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
};

const cache = new Map<CardnexusGameId, Map<string, number>>();

const PAGE_LIMIT = 100;

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

  const map = new Map<string, number>();
  let offset = 0;
  for (let page = 0; page < 50; page++) {
    const res = await cardnexusGet<ExpansionsPage>(
      `/games/${encodeURIComponent(gameId)}/expansions?limit=${PAGE_LIMIT}&offset=${offset}`,
      opts,
    );
    const rows = res?.data ?? [];
    for (const exp of rows) {
      if (typeof exp?.id !== "number" || !exp.code) continue;
      map.set(normCode(exp.code), exp.id);
    }
    if (!rows.length || !res?.pagination?.hasMore) break;
    offset += rows.length;
  }

  cache.set(gameId, map);
  return map;
}

/** Test seam. */
export function clearExpansionCache(): void {
  cache.clear();
}
