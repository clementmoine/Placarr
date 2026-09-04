/**
 * Drop ledger alias print keys (`nr.ss.*` / `nr.cc.*`) once the canonical
 * form (`nrss.*` / `cc.*`) exists — leftovers from CCG dotted ids.
 */
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { canonicalizeKayouNumberForSet } from "./kayouIdNormalize";
import { NARUTO_KAYOU_PACK_ID } from "./pack";
import { kayouPrintKey } from "./printKey";

export type KayouAliasPurgeReport = {
  migrated: number;
  renamed: number;
  removed: number;
};

export function purgeKayouAliasPrints(
  opts: { index?: ReturnType<typeof createLocalPrintsIndex> } = {},
): KayouAliasPurgeReport {
  const index = opts.index ?? createLocalPrintsIndex(NARUTO_KAYOU_PACK_ID);
  const db = index.openForWrite();
  const report: KayouAliasPurgeReport = {
    migrated: 0,
    renamed: 0,
    removed: 0,
  };

  try {
    const rows = db
      .prepare(`SELECT print_key AS printKey, set_code AS setCode, number FROM prints`)
      .all() as { printKey: string; setCode: string; number: string }[];

    const byKey = new Map(rows.map((r) => [r.printKey, r]));
    const aliases = rows.filter((r) => {
      const canon = canonicalizeKayouNumberForSet(r.setCode, r.number);
      return canon !== r.number.trim().toLowerCase();
    });

    const deletePrint = db.prepare(`DELETE FROM prints WHERE print_key = ?`);
    const deleteTitles = db.prepare(`DELETE FROM print_titles WHERE print_key = ?`);
    const deleteAssets = db.prepare(`DELETE FROM print_assets WHERE print_key = ?`);
    const insertPrint = db.prepare(
      `INSERT INTO prints (print_key, set_code, number, card_type, grouping, source_url)
       SELECT ?, set_code, ?, card_type, grouping, source_url
         FROM prints WHERE print_key = ?`,
    );
    const moveTitles = db.prepare(
      `UPDATE OR IGNORE print_titles SET print_key = ? WHERE print_key = ?`,
    );
    const moveAssets = db.prepare(
      `UPDATE OR IGNORE print_assets SET print_key = ? WHERE print_key = ?`,
    );

    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of aliases) {
        const number = canonicalizeKayouNumberForSet(row.setCode, row.number);
        const canonKey = kayouPrintKey(row.setCode, number);
        if (!canonKey || canonKey === row.printKey) continue;

        if (!byKey.has(canonKey)) {
          insertPrint.run(canonKey, number, row.printKey);
          byKey.set(canonKey, {
            printKey: canonKey,
            setCode: row.setCode,
            number,
          });
          report.renamed += 1;
        } else {
          report.migrated += 1;
        }

        moveTitles.run(canonKey, row.printKey);
        moveAssets.run(canonKey, row.printKey);
        deleteTitles.run(row.printKey);
        deleteAssets.run(row.printKey);
        deletePrint.run(row.printKey);
        byKey.delete(row.printKey);
        report.removed += 1;
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
    index.resetCache();
  }

  return report;
}
