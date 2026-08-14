/**
 * Collector numbers as Bandai prints them (`BT1-001`, `BT1-011_SPR`, `P-001`)
 * → Placarr print identity. Hyphens are the printKey separator, so the set
 * code and the number are the two segments; `_SPR` / `_PR` become grouping.
 */
import { buildPrintKey, type PrintIdentity } from "@/core/identify/printKey";

/** PrintKey game slug — Masters (the original DBS Card Game), not Fusion World. */
export const DBS_CG_GAME = "dbscg";

/**
 * `BT1-001` · `BT11-003` · `P-001` · `TB2-015` · `BT1-011_SPR`.
 * Underscore suffix is a parallel / promo grouping, not part of the number.
 */
const COLLECTOR_RE = /^([a-z]+[0-9]*)-([0-9]+)(?:_([a-z0-9]+))?$/i;

export type DbsCollectorNumber = {
  /** Printed set code, lowercased (`bt1`, `p`, `tb2`). */
  set: string;
  /** Collector digits as printed (`001`, `011`). */
  number: string;
  /** Parallel / promo suffix (`spr`, `pr`) when Bandai writes `_SPR`. */
  grouping: string | null;
};

export function parseDbsCollectorNumber(
  raw: string | null | undefined,
): DbsCollectorNumber | null {
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

export function dbsPrintIdentity(
  raw: string | null | undefined,
  game = DBS_CG_GAME,
): PrintIdentity | null {
  const parsed = parseDbsCollectorNumber(raw);
  if (!parsed) return null;
  return {
    game,
    set: parsed.set,
    number: parsed.number,
    grouping: parsed.grouping,
  };
}

export function dbsPrintKey(
  raw: string | null | undefined,
  game = DBS_CG_GAME,
): string | null {
  const identity = dbsPrintIdentity(raw, game);
  return identity ? buildPrintKey(identity) : null;
}

/**
 * How a collector reads the number off the card: `BT1-001`, `BT1-011_SPR`.
 */
export function formatDbsCollectorNumber(
  set: string,
  number: string,
  grouping?: string | null,
): string {
  const printed = `${set.trim().toUpperCase()}-${number.trim()}`;
  const group = grouping?.trim();
  return group ? `${printed}_${group.toUpperCase()}` : printed;
}

export function formatDbsReference(
  set: string,
  number: string,
  grouping?: string | null,
): string {
  return formatDbsCollectorNumber(set, number, grouping);
}
