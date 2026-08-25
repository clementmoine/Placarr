/**
 * Fusion World collector numbers (`ST01-001`, `FB10-003_p1`) → print identity.
 * Same Bandai `SET-NNN` shape as Masters; a different printKey game slug.
 */
import type { PrintIdentity } from "@/core/identify/printKey";
import {
  bandaiPrintIdentity,
  bandaiPrintKey,
  formatBandaiCollectorNumber,
  normalizeBandaiParallel,
  parseBandaiCollectorNumber,
  type BandaiCollectorNumber,
} from "@/providers/shared/dbs/bandaiCollector";

export const DBS_FW_GAME = "dbsfw";

export type DbsFwCollectorNumber = BandaiCollectorNumber;

export const parseDbsFwCollectorNumber = parseBandaiCollectorNumber;

/** Bandai `p=_p1` / filename `_p1` — strip the leading underscore. */
export const normalizeDbsFwParallel = normalizeBandaiParallel;

export function dbsFwPrintIdentity(
  raw: string | null | undefined,
  extraGrouping?: string | null,
): PrintIdentity | null {
  return bandaiPrintIdentity(DBS_FW_GAME, raw, extraGrouping);
}

export function dbsFwPrintKey(
  raw: string | null | undefined,
  extraGrouping?: string | null,
): string | null {
  return bandaiPrintKey(DBS_FW_GAME, raw, extraGrouping);
}

export const formatDbsFwCollectorNumber = formatBandaiCollectorNumber;

export function formatDbsFwReference(
  set: string,
  number: string,
  grouping?: string | null,
): string {
  return formatBandaiCollectorNumber(set, number, grouping);
}
