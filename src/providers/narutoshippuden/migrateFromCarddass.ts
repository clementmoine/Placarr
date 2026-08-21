/**
 * Sortir le 疾風伝 du pack Carddass, où il n'aurait jamais dû entrer.
 *
 * Les deux jeux cohabitaient dans `naruto/carddass` faute d'un endroit à part.
 * Conséquence visible : les 313 cartes du 疾風伝 recevaient le **dos Carddass**,
 * puisque les dos sont servis par langue et que cette ligne est japonaise.
 *
 * La migration **copie** — elle ne retire rien de la source. Retirer se décide
 * une fois la nouvelle base vérifiée, et se fait à part : une passe qui déplace
 * et casse ne laisse rien pour comparer.
 *
 * Le discriminant est la **famille**, pas le set : certains tirages portent
 * `unknown`, `mju` ou `gaku` en `set_code`, et seul le préfixe dit à quel jeu
 * ils appartiennent.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { dataRoot } from "@/lib/runtimeData";

import {
  openNarutoShippudenDbForWrite,
  resetNarutoShippudenIndexCache,
  SHIPPUDEN_FAMILIES,
} from "./indexStore";

function carddassDbPath(): string {
  return path.join(dataRoot(), "naruto", "carddass", "catalog.sqlite");
}

export type MigrationReport = {
  prints: number;
  titles: number;
  assets: number;
  bySet: Record<string, number>;
};

export function migrateShippudenFromCarddass(opts: { dryRun?: boolean } = {}): {
  report: MigrationReport;
  applied: boolean;
} {
  const source = carddassDbPath();
  const empty: MigrationReport = {
    prints: 0,
    titles: 0,
    assets: 0,
    bySet: {},
  };
  if (!existsSync(source)) return { report: empty, applied: false };

  const src = new DatabaseSync(source, { readOnly: true });
  const families = SHIPPUDEN_FAMILIES.map((f) => `'${f}'`).join(", ");
  try {
    const prints = src
      .prepare(
        `SELECT print_key AS printKey, set_code AS setCode, number,
                card_type AS cardType, grouping, source_url AS sourceUrl
           FROM prints WHERE card_type IN (${families})`,
      )
      .all() as {
      printKey: string;
      setCode: string;
      number: string;
      cardType: string;
      grouping: string | null;
      sourceUrl: string | null;
    }[];
    if (prints.length === 0) return { report: empty, applied: false };

    const keys = new Set(prints.map((row) => row.printKey));
    const titles = (
      src
        .prepare(
          `SELECT t.print_key AS printKey, t.lang, t.full_name AS fullName,
                  t.rarity
             FROM print_titles t
             JOIN prints p ON p.print_key = t.print_key
            WHERE p.card_type IN (${families})`,
        )
        .all() as {
        printKey: string;
        lang: string;
        fullName: string;
        rarity: string | null;
      }[]
    ).filter((row) => keys.has(row.printKey));
    const assets = (
      src
        .prepare(
          `SELECT a.print_key AS printKey, a.lang, a.art, a.thumb, a.back,
                  a.source_url AS sourceUrl, a.printed
             FROM print_assets a
             JOIN prints p ON p.print_key = a.print_key
            WHERE p.card_type IN (${families})`,
        )
        .all() as {
        printKey: string;
        lang: string;
        art: string | null;
        thumb: string | null;
        back: string | null;
        sourceUrl: string | null;
        printed: number;
      }[]
    ).filter((row) => keys.has(row.printKey));

    const bySet: Record<string, number> = {};
    for (const row of prints) {
      bySet[row.setCode] = (bySet[row.setCode] ?? 0) + 1;
    }
    const report: MigrationReport = {
      prints: prints.length,
      titles: titles.length,
      assets: assets.length,
      bySet,
    };
    if (opts.dryRun) return { report, applied: false };

    const dest = openNarutoShippudenDbForWrite();
    try {
      const insertPrint = dest.prepare(
        `INSERT INTO prints (print_key, set_code, number, card_type, grouping, source_url)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(print_key) DO UPDATE SET
           set_code = excluded.set_code,
           number = excluded.number,
           card_type = excluded.card_type,
           grouping = excluded.grouping,
           source_url = excluded.source_url`,
      );
      const insertTitle = dest.prepare(
        `INSERT INTO print_titles (print_key, lang, full_name, rarity)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(print_key, lang) DO UPDATE SET
           full_name = excluded.full_name,
           rarity = excluded.rarity`,
      );
      const insertAsset = dest.prepare(
        `INSERT INTO print_assets (print_key, lang, art, thumb, back, source_url, printed)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(print_key, lang) DO UPDATE SET
           art = excluded.art,
           thumb = excluded.thumb,
           back = excluded.back,
           source_url = excluded.source_url,
           printed = excluded.printed`,
      );

      dest.exec("BEGIN IMMEDIATE");
      try {
        for (const row of prints) {
          insertPrint.run(
            row.printKey,
            row.setCode,
            row.number,
            row.cardType,
            row.grouping,
            row.sourceUrl,
          );
        }
        for (const row of titles) {
          insertTitle.run(row.printKey, row.lang, row.fullName, row.rarity);
        }
        for (const row of assets) {
          insertAsset.run(
            row.printKey,
            row.lang,
            row.art,
            row.thumb,
            row.back,
            row.sourceUrl,
            row.printed,
          );
        }
        dest.exec("COMMIT");
      } catch (error) {
        dest.exec("ROLLBACK");
        throw error;
      }
    } finally {
      dest.close();
      resetNarutoShippudenIndexCache();
    }
    return { report, applied: true };
  } finally {
    src.close();
  }
}

/**
 * Retire du pack Carddass ce qui appartient au 疾風伝.
 *
 * Second temps de la migration, délibérément séparé du premier : une passe qui
 * déplace et casse ne laisse rien pour comparer. Ici on efface, donc on vérifie
 * d'abord.
 *
 * **Le garde-fou est la règle, pas une politesse.** Chaque clé doit être
 * présente à destination avant d'être retirée de la source ; s'il en manque
 * une seule, rien n'est effacé et l'appel rend ce qui manque. Une carte perdue
 * entre deux bases ne se retrouve pas.
 */
export function pruneShippudenFromCarddass(opts: { dryRun?: boolean } = {}): {
  removed: number;
  missingAtDestination: string[];
} {
  const source = carddassDbPath();
  if (!existsSync(source)) return { removed: 0, missingAtDestination: [] };

  const families = SHIPPUDEN_FAMILIES.map((f) => `'${f}'`).join(", ");
  const dest = openNarutoShippudenDbForWrite();
  let held: Set<string>;
  try {
    held = new Set(
      (
        dest.prepare(`SELECT print_key AS printKey FROM prints`).all() as {
          printKey: string;
        }[]
      ).map((row) => row.printKey),
    );
  } finally {
    dest.close();
  }

  const db = new DatabaseSync(source);
  try {
    const keys = (
      db
        .prepare(
          `SELECT print_key AS printKey FROM prints WHERE card_type IN (${families})`,
        )
        .all() as { printKey: string }[]
    ).map((row) => row.printKey);

    const missing = keys.filter((key) => !held.has(key));
    if (missing.length > 0)
      return { removed: 0, missingAtDestination: missing };
    if (opts.dryRun) {
      return { removed: keys.length, missingAtDestination: [] };
    }

    db.exec("PRAGMA busy_timeout = 30000");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(
        `DELETE FROM print_titles WHERE print_key IN
           (SELECT print_key FROM prints WHERE card_type IN (${families}))`,
      );
      db.exec(
        `DELETE FROM print_assets WHERE print_key IN
           (SELECT print_key FROM prints WHERE card_type IN (${families}))`,
      );
      db.exec(`DELETE FROM prints WHERE card_type IN (${families})`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { removed: keys.length, missingAtDestination: [] };
  } finally {
    db.close();
  }
}
