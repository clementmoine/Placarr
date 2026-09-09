/**
 * OPTCG collector numbers (`OP01-001`, `ST01-001_p1`) → print identity.
 * Same Bandai `SET-NNN` shape as DBS Fusion World.
 */
import type { PrintIdentity } from "@/core/identify/printKey";
import {
  bandaiPrintIdentity,
  bandaiPrintKey,
  formatBandaiCollectorNumber,
  parseBandaiCollectorNumber,
  type BandaiCollectorNumber,
} from "@/providers/shared/dbs/bandaiCollector";

import { ONEPIECE_PRINT_GAME } from "./pack";

export type OnepieceCollectorNumber = BandaiCollectorNumber;

export const parseOnepieceCollectorNumber = parseBandaiCollectorNumber;

export function onepiecePrintIdentity(
  raw: string | null | undefined,
  extraGrouping?: string | null,
): PrintIdentity | null {
  return bandaiPrintIdentity(ONEPIECE_PRINT_GAME, raw, extraGrouping);
}

export function onepiecePrintKey(
  raw: string | null | undefined,
  extraGrouping?: string | null,
): string | null {
  return bandaiPrintKey(ONEPIECE_PRINT_GAME, raw, extraGrouping);
}

export function formatOnepieceReference(
  set: string,
  number: string,
  grouping?: string | null,
): string {
  return formatBandaiCollectorNumber(set, number, grouping);
}
