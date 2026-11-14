/**
 * Item Affiche cover policy — auto tracks the ranking engine; pinned keeps an
 * explicit dump / import. Null = pre-coverMode rows (legacy heuristics).
 */

export const COVER_MODES = ["auto", "pinned"] as const;
export type CoverMode = (typeof COVER_MODES)[number];

export function parseCoverMode(
  value: unknown,
): CoverMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto" || normalized === "pinned") return normalized;
  return null;
}

/** Refresh / densify may overwrite `item.imageUrl` when auto (or legacy unset). */
export function coverModeAllowsEngineRefresh(
  coverMode: string | null | undefined,
): boolean {
  const mode = parseCoverMode(coverMode);
  return mode !== "pinned";
}

/** Explicit Affiche dump / import / upload. */
export function coverModeIsPinned(
  coverMode: string | null | undefined,
): boolean {
  return parseCoverMode(coverMode) === "pinned";
}
