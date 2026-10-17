/**
 * Super Série / SJCC cards are **DB-###** prints under `ssN` (dbzc idc=112),
 * not reprints of JCC `D-###` (`partN`).
 *
 * An earlier DCM pass wrongly attached `ssN` membership onto `partN` printKeys.
 * This module only clears that false link — real SS catalogue comes from
 * `dbzcollection-super.json` harvest/install.
 */
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { packCatalogDb } from "@/lib/packPaths";

import { DBS_JCC_PACK_ID } from "../pack";

export type ClearFalseSuperSerieMembershipReport = {
  removed: number;
};

/**
 * Drop `print_sets` rows that mapped Super Série onto classic JCC part prints.
 */
export function clearFalseSuperSeriePartMemberships(
  packId: string = DBS_JCC_PACK_ID,
): ClearFalseSuperSerieMembershipReport {
  const dbPath = packCatalogDb(packId);
  if (!existsSync(dbPath)) return { removed: 0 };
  const db = new DatabaseSync(dbPath);
  try {
    const result = db
      .prepare(
        `DELETE FROM print_sets
          WHERE set_code LIKE 'ss%'
            AND print_key LIKE 'dbsjcc:part%'`,
      )
      .run();
    return { removed: Number(result.changes ?? 0) };
  } finally {
    db.close();
  }
}

/** @deprecated Cleanup-only — real SS cards are installed from dbzc Super JCC. */
export type InstallSuperSerieMembershipReport = {
  albums: number;
  listed: number;
  linked: number;
  missing: number;
  missingPrinted: string[];
  cleared: number;
};

/**
 * Cleanup entry used by DeckCardMania install — no longer invents memberships.
 */
export function installDbsJccSuperSerieMembership(): InstallSuperSerieMembershipReport {
  const cleared = clearFalseSuperSeriePartMemberships().removed;
  return {
    albums: 0,
    listed: 0,
    linked: 0,
    missing: 0,
    missingPrinted: [],
    cleared,
  };
}
