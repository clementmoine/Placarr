"use client";

import type { PrintVariantInfo } from "@/lib/client/hooks/usePrintVariant";

/**
 * One shared answer to "what is this copy a print of", for every card on screen.
 *
 * A tile cannot draw the right foil until it knows which finishes its print
 * exists in. That was resolved per list, which meant every new list of cards had
 * to remember to resolve and thread the answer down — and five of them didn't,
 * so a foil card looked ordinary everywhere except the shelf grid.
 *
 * So the batching moved here. Cards ask for themselves, the asks coalesce into
 * one request per media type, and the answers are kept for the session: a print
 * is an immutable fact about a printing, so re-asking on the next page is waste.
 */

/**
 * The ceiling the API enforces on a batch — above it, extra keys are **silently
 * dropped**, so the chunking has to happen here rather than being noticed later
 * as a few cards that never shimmer.
 */
const MAX_BATCH_KEYS = 120;

/**
 * Bump when localized mask bytes change shape (e.g. bake v2 kept RGB for
 * Unity). Print facts are otherwise immutable, but a session that resolved
 * before the bake fix would keep serving white-RGB foil masks forever.
 */
/** Bumped for `effectPack` on PrintCandidate — stale sessions would stay CSS-only. */
const PRINT_VARIANT_CACHE_VERSION = 3;

/** `type` is part of the key: it decides which providers are even asked. */
function cacheKey(printKey: string, type: string): string {
  return `v${PRINT_VARIANT_CACHE_VERSION}|${type}|${printKey}`;
}

/** Resolved answers, `null` for "asked, and this print is unknown". */
const resolved = new Map<string, PrintVariantInfo | null>();
/** Asked for but not back yet, so a second card does not ask again. */
const asked = new Set<string>();
/** Waiting to go out, grouped the way the request groups them. */
const queued = new Map<string, Set<string>>();
const listeners = new Set<() => void>();
let flushScheduled = false;

function announce() {
  for (const listener of listeners) listener();
}

export function subscribeToPrintVariants(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * What is known right now — never a request. Returns `null` both for "not asked
 * yet" and for "unknown print", because a card draws the same either way.
 */
export function peekPrintVariant(
  printKey: string | null | undefined,
  type: string | null | undefined,
): PrintVariantInfo | null {
  if (!printKey || !type) return null;
  return resolved.get(cacheKey(printKey, type)) ?? null;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchBatch(type: string, printKeys: string[]): Promise<void> {
  const query = new URLSearchParams({ printKeys: printKeys.join(","), type });
  let candidates: Record<string, PrintVariantInfo> = {};
  try {
    const response = await fetch(`/api/prints?${query}`);
    if (response.ok) {
      const data = (await response.json()) as {
        candidates?: Record<string, PrintVariantInfo>;
      };
      candidates = data.candidates ?? {};
    }
  } catch {
    // Unknown simply means no effect on the tiles, never a failure.
  }

  for (const printKey of printKeys) {
    const key = cacheKey(printKey, type);
    // Recorded even when absent: an unknown print asked for once should not be
    // asked for again on every list that happens to show it.
    resolved.set(key, candidates[printKey] ?? null);
    asked.delete(key);
  }
}

function flush() {
  flushScheduled = false;
  const batches = [...queued.entries()];
  queued.clear();

  for (const [type, printKeys] of batches) {
    for (const keys of chunk([...printKeys], MAX_BATCH_KEYS)) {
      void fetchBatch(type, keys).then(announce);
    }
  }
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  // A task rather than a microtask: the cards register from their effects, and
  // this has to wait for the whole commit's worth of them to arrive.
  setTimeout(flush, 0);
}

/** Ask, if nobody has. Cheap and idempotent — safe to call on every render. */
export function requestPrintVariant(
  printKey: string | null | undefined,
  type: string | null | undefined,
): void {
  if (!printKey || !type) return;
  const key = cacheKey(printKey, type);
  if (resolved.has(key) || asked.has(key)) return;

  asked.add(key);
  const forType = queued.get(type) ?? new Set<string>();
  forType.add(printKey);
  queued.set(type, forType);
  scheduleFlush();
}

/** @internal test hook — the cache is deliberately session-long otherwise. */
export function resetPrintVariantStore(): void {
  resolved.clear();
  asked.clear();
  queued.clear();
  listeners.clear();
  flushScheduled = false;
}
