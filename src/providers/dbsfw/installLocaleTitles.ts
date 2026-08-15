/**
 * Give Fusion World the locales Bandai never published.
 *
 * Bandai runs one Fusion World cardlist, in English — `/fw/ja/cardlist/` is a
 * 404 — so the catalogue holds 3946 printings and every one of them is English.
 * dbscards, meanwhile, lists the Japanese printings, name included.
 *
 * Without this the Japanese faces would be downloaded and never shown: a card
 * is served from its own locale folder, and with no `ja` title row there is no
 * `ja` card to serve. So the title comes from the same tile that carries the
 * image URL — no extra request, and the two always agree because they are read
 * from one place.
 *
 * Rerunnable on purpose: `writeDbsFwIndex` drops and recreates the database, so
 * a fresh Bandai scrape erases these rows. They are re-added by running the
 * `dbscards` step again, which is where this is wired.
 */
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  buildDbscardsIndex,
  lookupDbscardsEntry,
  type DbscardsIndexEntry,
} from "@/providers/shared/dbscards/list";
import { dbscardsIndexPath } from "@/providers/shared/dbscards/scrapeList";

import {
  DBS_FW_PACK_ID,
  dbsFwDbPath,
  resetDbsFwDbCache,
} from "./indexStore";

export type InstallLocaleTitlesResult = {
  lang: string;
  /** Printings that gained a title in this locale. */
  written: number;
  /** Printings the list does not carry — they stay English-only. */
  missing: number;
};

/**
 * Write one locale's titles from the crawled dbscards list.
 *
 * A parallel (`_p1`) takes the same name as its base printing: dbscards files
 * every version of a card under one collector code, and a parallel is the same
 * card with different art, not a different name.
 */
export function installDbsFwLocaleTitles(
  lang: string,
): InstallLocaleTitlesResult {
  const key = lang.toLowerCase();
  let entries: DbscardsIndexEntry[];
  try {
    entries = JSON.parse(
      readFileSync(dbscardsIndexPath(DBS_FW_PACK_ID, key), "utf8"),
    ) as DbscardsIndexEntry[];
  } catch {
    return { lang: key, written: 0, missing: 0 };
  }

  /*
    Our own connection: `ensureDbsFwIndex` hands out a read-only one, which is
    right for serving and wrong for this.
  */
  const dbPath = dbsFwDbPath();
  if (!existsSync(dbPath)) return { lang: key, written: 0, missing: 0 };
  resetDbsFwDbCache();
  const db = new DatabaseSync(dbPath);

  const index = buildDbscardsIndex(entries);
  const prints = db
    .prepare("SELECT print_key AS printKey, set_code AS setCode, number FROM prints")
    .all() as Array<{ printKey: string; setCode: string; number: string }>;

  const insert = db.prepare(`
    INSERT INTO print_titles (print_key, lang, full_name, set_name)
    VALUES (?, ?, ?, NULL)
    ON CONFLICT(print_key, lang) DO UPDATE SET full_name = excluded.full_name
  `);

  let written = 0;
  let missing = 0;
  db.exec("BEGIN");
  try {
    for (const print of prints) {
      const entry = lookupDbscardsEntry(
        index,
        `${print.setCode}-${print.number}`.toLowerCase(),
      );
      const name = entry?.name?.trim();
      if (!name) {
        missing += 1;
        continue;
      }
      insert.run(print.printKey, key, name);
      written += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  db.close();
  resetDbsFwDbCache();
  return { lang: key, written, missing };
}
