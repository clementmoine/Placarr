/**
 * Map a TCGdex set id onto TCG Live CDN set stem(s).
 *
 * Order:
 * 1. Explicit irreducible aliases ({@link TCGDEX_TO_LIVE_SETS}) — shrink over time
 * 2. Mechanical normalizer: `.` → `-`, strip leading zeros (`sv03.5` → `sv3-5`)
 *    so new retail sets with matching stems need no table row
 *
 * Reprint fallbacks for TCGdex Shiny Vault splits (`*sv`) — see
 * {@link liveSetCandidatesForResolve}.
 */
import { TCGDEX_TO_LIVE_SETS } from "./setAliases";

/** McDonald's year collections (`2023sv`) — not parent+sv vault splits. */
const YEAR_SV_RE = /^\d{4}sv$/;

export function liveSetCandidatesFromTcgdexSet(
  setId: string | null | undefined,
): string[] {
  const raw = setId?.trim().toLowerCase();
  if (!raw) return [];

  const aliased = TCGDEX_TO_LIVE_SETS[raw];
  if (aliased?.length) return [...aliased];

  const normalized = normalizeLiveSetId(raw);
  return normalized ? [normalized] : [];
}

/** Primary Live stem for a TCGdex set (first candidate). */
export function liveSetIdFromTcgdexSet(
  setId: string | null | undefined,
): string | null {
  return liveSetCandidatesFromTcgdexSet(setId)[0] ?? null;
}

/**
 * Parent Live stem for a TCGdex Shiny Vault split id (`swsh4.5sv` → `swsh4-5`).
 * Empty when the id is not a vault split pattern.
 */
export function mechanicalReprintFallbackStems(
  setId: string | null | undefined,
): string[] {
  const raw = setId?.trim().toLowerCase() ?? "";
  if (!raw.endsWith("sv") || YEAR_SV_RE.test(raw)) return [];
  const parentRaw = raw.slice(0, -2);
  if (!parentRaw || !/\d/.test(parentRaw)) return [];

  const parent = normalizeLiveSetId(parentRaw);
  const self = normalizeLiveSetId(raw);
  if (!parent || !self || parent === self) return [];
  return [parent];
}

/**
 * Resolve-time candidates: primary stems, plus mechanical `*sv` reprint
 * fallbacks **only** when no primary stem exists in the local dump yet.
 */
export function liveSetCandidatesForResolve(
  setId: string | null | undefined,
  dumpHasStem: (stem: string) => boolean,
): { primary: string[]; candidates: string[] } {
  const primary = liveSetCandidatesFromTcgdexSet(setId);
  if (primary.length === 0) {
    return { primary, candidates: [] };
  }
  if (primary.some((stem) => dumpHasStem(stem))) {
    return { primary, candidates: primary };
  }

  const fallbacks = mechanicalReprintFallbackStems(setId).filter((stem) =>
    dumpHasStem(stem),
  );
  if (fallbacks.length === 0) {
    return { primary, candidates: primary };
  }

  const candidates = [...primary];
  for (const stem of fallbacks) {
    if (!candidates.includes(stem)) candidates.push(stem);
  }
  return { primary, candidates };
}

export function normalizeLiveSetId(raw: string): string | null {
  const withDashes = raw.replace(/\./g, "-");
  const parts = withDashes.split("-").filter(Boolean);
  if (parts.length === 0) return null;
  const normalized = parts.map(normalizeSetSegment).filter(Boolean);
  if (normalized.length === 0) return null;
  return normalized.join("-");
}

function normalizeSetSegment(segment: string): string {
  if (/^\d+$/.test(segment)) {
    return String(Number.parseInt(segment, 10));
  }
  const match = /^([a-z]+)(\d+)$/i.exec(segment);
  if (match) {
    const letters = match[1]!.toLowerCase();
    const digits = String(Number.parseInt(match[2]!, 10));
    return `${letters}${digits}`;
  }
  return segment.toLowerCase();
}
