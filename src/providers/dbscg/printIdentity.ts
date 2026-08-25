/**
 * Collector numbers as Bandai prints them (`BT1-001`, `BT1-011_SPR`, `P-001`)
 * → Placarr print identity. Shared parser : `shared/dbs/bandaiCollector`.
 */
import type { PrintIdentity } from "@/core/identify/printKey";
import {
  bandaiPrintIdentity,
  bandaiPrintKey,
  formatBandaiCollectorNumber,
  parseBandaiCollectorNumber,
  type BandaiCollectorNumber,
} from "@/providers/shared/dbs/bandaiCollector";

/** PrintKey game slug — Masters (the original DBS Card Game), not Fusion World. */
export const DBS_CG_GAME = "dbscg";

export type DbsCollectorNumber = BandaiCollectorNumber;

export const parseDbsCollectorNumber = parseBandaiCollectorNumber;

export function dbsPrintIdentity(
  raw: string | null | undefined,
  game = DBS_CG_GAME,
): PrintIdentity | null {
  return bandaiPrintIdentity(game, raw);
}

export function dbsPrintKey(
  raw: string | null | undefined,
  game = DBS_CG_GAME,
): string | null {
  return bandaiPrintKey(game, raw);
}

/**
 * How a collector reads the number off the card: `BT1-001`, `BT1-011_SPR`.
 */
export const formatDbsCollectorNumber = formatBandaiCollectorNumber;

export function formatDbsReference(
  set: string,
  number: string,
  grouping?: string | null,
): string {
  return formatBandaiCollectorNumber(set, number, grouping);
}
