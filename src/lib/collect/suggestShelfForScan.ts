/**
 * Suggest a collection shelf for a scan lock (barcode or card).
 *
 * Order: barcode guess (auto) → type filter → pathname/preferred →
 * catalogue label score → weak preferred fallback. Ambiguous catalogue
 * scores stay empty (honest miss), never a confident false positive.
 */
import {
  MIN_CATALOGUE_SCORE,
  MIN_SCORE_GAP,
  shelfCatalogueScore,
} from "@/lib/collect/inferPrintPickerDefaults";

export type SuggestShelfRow = {
  id: string;
  name: string;
  type: string;
  slug?: string | null;
};

export type SuggestShelfForScanInput = {
  shelves: readonly SuggestShelfRow[];
  /** Shelf type of the scanned product (`tcg`, `games`…). */
  itemType?: string | null;
  /** Current route, used to prefer `/shelves/<id|slug>`. */
  pathname?: string | null;
  preferredShelfId?: string | null;
  /** Catalogue / pack labels to score against shelf names. */
  catalogueLabels?: readonly string[];
  /** Free-text hints (barcode titles, platform names…). */
  searchNames?: readonly string[];
  /**
   * Winner from `guessShelfFromBarcodeLookup` — applied as sure when the
   * shelf still exists (and matches `itemType` when set).
   */
  barcodeGuessShelfId?: string | null;
};

export type SuggestShelfForScanResult = {
  shelfId: string | null;
  confidence: "sure" | "weak" | "none";
};

function shelfFromPathname(
  shelves: readonly SuggestShelfRow[],
  pathname: string | null | undefined,
): SuggestShelfRow | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/shelves\/([^/]+)/);
  if (!match?.[1]) return null;
  const key = decodeURIComponent(match[1]);
  return (
    shelves.find(
      (shelf) =>
        shelf.id === key ||
        shelf.slug === key ||
        shelf.name === key,
    ) ?? null
  );
}

function bestCatalogueMatch(
  shelves: readonly SuggestShelfRow[],
  labels: readonly string[],
): { shelfId: string; score: number; gap: number } | null {
  if (shelves.length === 0 || labels.length === 0) return null;

  const scored = shelves
    .map((shelf) => {
      let best = 0;
      for (const label of labels) {
        const score = shelfCatalogueScore(shelf.name, label);
        if (score > best) best = score;
      }
      return { shelfId: shelf.id, score: best };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top) return null;
  const second = scored[1]?.score ?? 0;
  return { shelfId: top.shelfId, score: top.score, gap: top.score - second };
}

export function suggestShelfForScan(
  input: SuggestShelfForScanInput,
): SuggestShelfForScanResult {
  const shelves = input.shelves;
  if (shelves.length === 0) {
    return { shelfId: null, confidence: "none" };
  }

  const typed = input.itemType
    ? shelves.filter((shelf) => shelf.type === input.itemType)
    : shelves;
  const pool = typed.length > 0 ? typed : shelves;

  const barcodeGuess = input.barcodeGuessShelfId?.trim() || null;
  if (barcodeGuess) {
    const hit = pool.find((shelf) => shelf.id === barcodeGuess);
    if (hit) return { shelfId: hit.id, confidence: "sure" };
  }

  const fromPath = shelfFromPathname(pool, input.pathname);
  if (fromPath) {
    return { shelfId: fromPath.id, confidence: "sure" };
  }

  const preferred =
    (input.preferredShelfId &&
      pool.find((shelf) => shelf.id === input.preferredShelfId)) ||
    null;

  const labels = [
    ...(input.catalogueLabels ?? []),
    ...(input.searchNames ?? []),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  const catalogue = bestCatalogueMatch(pool, labels);
  if (
    catalogue &&
    catalogue.score >= MIN_CATALOGUE_SCORE &&
    catalogue.gap >= MIN_SCORE_GAP
  ) {
    return { shelfId: catalogue.shelfId, confidence: "sure" };
  }

  if (preferred) {
    return { shelfId: preferred.id, confidence: "weak" };
  }

  // Ambiguous catalogue scores (several Naruto lines, franchise-only label)
  // stay empty — never a confident false positive.
  if (pool.length === 1) {
    return { shelfId: pool[0]!.id, confidence: "weak" };
  }

  return { shelfId: null, confidence: "none" };
}
