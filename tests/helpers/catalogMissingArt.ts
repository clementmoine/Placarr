/**
 * Faces absentes d'un catalogue local, lues dans sa base — pour que les tests
 * d'audit « sans face » vérifient l'invariant (les lignes rendues sont celles
 * qui manquent, sans repli CDN) plutôt qu'un seuil daté : un corpus complet
 * a le droit d'avoir zéro trou.
 */
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { packCatalogDb } from "@/lib/packPaths";

/** Titres (print × langue) sans `print_assets.art`, filtrés par langue si fournie. */
export function countCatalogMissingArt(pack: string, lang?: string): number {
  const dbPath = packCatalogDb(pack);
  if (!existsSync(dbPath)) return 0;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n
           FROM print_titles t
           LEFT JOIN print_assets a
             ON a.print_key = t.print_key AND a.lang = t.lang
          WHERE (a.art IS NULL OR TRIM(a.art) = '')
            AND (? IS NULL OR t.lang = ?)`,
      )
      .get(lang ?? null, lang ?? null) as { n: number };
    return Number(row.n);
  } finally {
    db.close();
  }
}

/** printKeys ayant une face locale dans `lang`. */
export function catalogPrintKeysWithArt(
  pack: string,
  lang: string,
): Set<string> {
  const dbPath = packCatalogDb(pack);
  if (!existsSync(dbPath)) return new Set();
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT print_key AS printKey FROM print_assets
          WHERE lang = ? AND art IS NOT NULL AND TRIM(art) != ''`,
      )
      .all(lang) as Array<{ printKey: string }>;
    return new Set(rows.map((row) => row.printKey));
  } finally {
    db.close();
  }
}
