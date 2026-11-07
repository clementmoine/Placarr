/**
 * Catalogue titles for a shortlist of printKeys — server-side OCR title clue.
 */
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { packCatalogDb } from "@/lib/packPaths";

export function loadPrintTitlesForKeys(
  packIds: readonly string[],
  printKeys: readonly string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const keys = [...new Set(printKeys.filter(Boolean))];
  if (!keys.length || !packIds.length) return out;
  const placeholders = keys.map(() => "?").join(",");
  for (const packId of packIds) {
    const dbPath = packCatalogDb(packId);
    if (!existsSync(dbPath)) continue;
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
    } catch {
      continue;
    }
    try {
      const has = db
        .prepare(
          `SELECT 1 AS ok FROM sqlite_master
            WHERE type = 'table' AND name = 'print_titles' LIMIT 1`,
        )
        .get() as { ok?: number } | undefined;
      if (!has?.ok) continue;
      const rows = db
        .prepare(
          `SELECT print_key AS k, full_name AS n
             FROM print_titles
            WHERE print_key IN (${placeholders})`,
        )
        .all(...keys) as Array<{ k: string; n: string }>;
      for (const row of rows) {
        const name = String(row.n ?? "").trim();
        if (!name) continue;
        const list = out.get(row.k) ?? [];
        list.push(name);
        out.set(row.k, list);
      }
    } catch {
      /* pack schema without titles */
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}
