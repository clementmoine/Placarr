/**
 * Read Bandai series out of a pack's `catalog.sqlite`.
 *
 * Masters and Fusion World share the same two tables (`prints.set_code`,
 * `print_titles.set_name`). The pack is an argument; nothing here knows
 * which game it is reading.
 */
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { parsePrintKey } from "@/core/identify/printKey";

import {
  catalogFullRefFromPrintKey,
  catalogRefFromPrintKey,
  type DbscardsCatalogIndex,
  type DbscardsCatalogPrint,
} from "./completePrints";

export function loadDbscardsCatalogIndex(opts: {
  dbPath: string;
  lang: string;
}): DbscardsCatalogIndex | null {
  if (!existsSync(opts.dbPath)) return null;
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(opts.dbPath, { readOnly: true });
  } catch {
    return null;
  }
  try {
    const rows = db
      .prepare(
        `SELECT p.print_key AS printKey, p.set_code AS setCode,
                t.set_name AS setName, t.full_name AS fullName
           FROM prints p
           JOIN print_titles t
             ON t.print_key = p.print_key AND t.lang = ?
          WHERE t.set_name IS NOT NULL AND t.set_name != ''`,
      )
      .all(opts.lang.toLowerCase()) as Array<{
      printKey: string;
      setCode: string;
      setName: string;
      fullName: string;
    }>;
    const bySetCode = new Map<string, DbscardsCatalogPrint[]>();
    const bySetName = new Map<string, DbscardsCatalogPrint[]>();
    for (const row of rows) {
      const ref = catalogRefFromPrintKey(row.printKey);
      const fullRef = catalogFullRefFromPrintKey(row.printKey);
      if (!ref || !fullRef) continue;
      const print: DbscardsCatalogPrint = {
        printKey: row.printKey,
        setCode: row.setCode.toLowerCase(),
        setName: row.setName,
        name: row.fullName,
        ref,
        fullRef,
        grouping: parsePrintKey(row.printKey)?.grouping ?? null,
      };
      const codeBucket = bySetCode.get(print.setCode);
      if (codeBucket) codeBucket.push(print);
      else bySetCode.set(print.setCode, [print]);
      const nameBucket = bySetName.get(print.setName);
      if (nameBucket) nameBucket.push(print);
      else bySetName.set(print.setName, [print]);
    }
    if (bySetName.size === 0) return null;
    return { bySetCode, bySetName };
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}
