/**
 * Fusion World collector numbers (`ST01-001`, `FB10-003_p1`) → print identity.
 * Same Bandai `SET-NNN` shape as Masters; a different printKey game slug.
 */
import { buildPrintKey, type PrintIdentity } from "@/core/identify/printKey";

export const DBS_FW_GAME = "dbsfw";

const COLLECTOR_RE = /^([a-z]+[0-9]*)-([0-9]+)(?:_([a-z0-9]+))?$/i;

export type DbsFwCollectorNumber = {
  set: string;
  number: string;
  grouping: string | null;
};

export function parseDbsFwCollectorNumber(
  raw: string | null | undefined,
): DbsFwCollectorNumber | null {
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
export function normalizeDbsFwParallel(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim().replace(/^_+/, "").toLowerCase();
  return trimmed || null;
}

export function dbsFwPrintIdentity(
  raw: string | null | undefined,
  extraGrouping?: string | null,
): PrintIdentity | null {
  const parsed = parseDbsFwCollectorNumber(raw);
  if (!parsed) return null;
  const grouping = normalizeDbsFwParallel(extraGrouping) ?? parsed.grouping;
  return {
    game: DBS_FW_GAME,
    set: parsed.set,
    number: parsed.number,
    grouping,
  };
}

export function dbsFwPrintKey(
  raw: string | null | undefined,
  extraGrouping?: string | null,
): string | null {
  const identity = dbsFwPrintIdentity(raw, extraGrouping);
  return identity ? buildPrintKey(identity) : null;
}

export function formatDbsFwCollectorNumber(
  set: string,
  number: string,
  grouping?: string | null,
): string {
  const printed = `${set.trim().toUpperCase()}-${number.trim()}`;
  const group = grouping?.trim();
  return group ? `${printed}_${group.toUpperCase()}` : printed;
}

export function formatDbsFwReference(
  set: string,
  number: string,
  grouping?: string | null,
): string {
  return formatDbsFwCollectorNumber(set, number, grouping);
}
