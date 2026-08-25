/**
 * Numéros Bandai `SET-NNN` / `SET-NNN_SUFFIX` — forme commune Masters et
 * Fusion World. Le slug de jeu (`dbscg` / `dbsfw`) reste chez le provider.
 */
import { buildPrintKey, type PrintIdentity } from "@/core/identify/printKey";

/**
 * `BT1-001` · `BT11-003` · `P-001` · `ST01-001` · `BT1-011_SPR` · `FB10-003_p1`.
 * Le suffixe après `_` est un parallel / promo, pas le numéro.
 */
const COLLECTOR_RE = /^([a-z]+[0-9]*)-([0-9]+)(?:_([a-z0-9]+))?$/i;

export type BandaiCollectorNumber = {
  /** Set imprimé, lowercased (`bt1`, `st01`, `p`). */
  set: string;
  /** Digits telles qu'imprimées (`001`). */
  number: string;
  /** Parallel / promo (`spr`, `p1`) quand Bandai écrit `_SPR` / `_p1`. */
  grouping: string | null;
};

export function parseBandaiCollectorNumber(
  raw: string | null | undefined,
): BandaiCollectorNumber | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const match = COLLECTOR_RE.exec(trimmed);
  if (!match) return null;
  return {
    set: match[1]!.toLowerCase(),
    number: match[2]!,
    grouping: match[3] ? match[3].toLowerCase() : null,
  };
}

/** Bandai `p=_p1` / filename `_p1` — strip the leading underscore. */
export function normalizeBandaiParallel(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim().replace(/^_+/, "").toLowerCase();
  return trimmed || null;
}

export function formatBandaiCollectorNumber(
  set: string,
  number: string,
  grouping?: string | null,
): string {
  const printed = `${set.trim().toUpperCase()}-${number.trim()}`;
  const group = grouping?.trim();
  return group ? `${printed}_${group.toUpperCase()}` : printed;
}

export function bandaiPrintIdentity(
  game: string,
  raw: string | null | undefined,
  extraGrouping?: string | null,
): PrintIdentity | null {
  const parsed = parseBandaiCollectorNumber(raw);
  if (!parsed) return null;
  const grouping = normalizeBandaiParallel(extraGrouping) ?? parsed.grouping;
  return {
    game,
    set: parsed.set,
    number: parsed.number,
    grouping,
  };
}

export function bandaiPrintKey(
  game: string,
  raw: string | null | undefined,
  extraGrouping?: string | null,
): string | null {
  const identity = bandaiPrintIdentity(game, raw, extraGrouping);
  return identity ? buildPrintKey(identity) : null;
}
