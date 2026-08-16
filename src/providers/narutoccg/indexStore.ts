/**
 * Naruto CCG local catalogue — `data/naruto/ccg/catalog.sqlite` + cards-index.json.
 * Closed corpus (Wayback carddass.fr). Server/script only.
 */
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { CardsIndexEntry, CardsIndexV1 } from "@/effects/cardsIndex";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_GAME } from "./parseCarddassAsset";

export const NARUTO_CCG_SCHEMA_VERSION = "1";
export const NARUTO_PACK_ID = "naruto/ccg";

export type NarutoPrintRow = {
  printKey: string;
  setCode: string;
  number: string;
  cardType: string;
  grouping?: string | null;
  sourceUrl?: string | null;
};

export type NarutoTitleRow = {
  printKey: string;
  lang: string;
  fullName: string;
  rarity?: string | null;
};

export type NarutoAssetRow = {
  printKey: string;
  lang: string;
  art?: string | null;
  /** Card-local file (`thumb.jpg`) — same convention as Lorcana. */
  thumb?: string | null;
  back?: string | null;
  sourceUrl?: string | null;
  waybackTimestamp?: string | null;
};

let activeDb: DatabaseSync | null = null;

export function narutoCcgDbPath(): string {
  const override = process.env.PLACARR_NARUTO_DB?.trim();
  if (override) return path.resolve(override);
  return path.join(dataRoot(), NARUTO_PACK_ID, "catalog.sqlite");
}

export function resetNarutoCcgDbCache(): void {
  try {
    activeDb?.close();
  } catch {
    /* ignore */
  }
  activeDb = null;
}

function createSchema(db: DatabaseSync): void {
  db.exec(`
    DROP TABLE IF EXISTS meta;
    DROP TABLE IF EXISTS print_assets;
    DROP TABLE IF EXISTS print_titles;
    DROP TABLE IF EXISTS prints;

    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE prints (
      print_key TEXT PRIMARY KEY,
      set_code TEXT NOT NULL,
      number TEXT NOT NULL,
      card_type TEXT NOT NULL,
      grouping TEXT,
      source_url TEXT
    );

    CREATE TABLE print_titles (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      full_name TEXT NOT NULL,
      rarity TEXT,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );

    CREATE TABLE print_assets (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      art TEXT,
      thumb TEXT,
      back TEXT,
      source_url TEXT,
      wayback_timestamp TEXT,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );
  `);
}

export function writeNarutoCcgIndex(input: {
  prints: NarutoPrintRow[];
  titles?: NarutoTitleRow[];
  assets: NarutoAssetRow[];
  dbPath?: string;
  meta?: Record<string, string>;
}): { dbPath: string; printCount: number } {
  const dbPath = input.dbPath ?? narutoCcgDbPath();
  resetNarutoCcgDbCache();
  if (existsSync(dbPath)) {
    try {
      unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  }
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  createSchema(db);

  const insertPrint = db.prepare(`
    INSERT INTO prints (print_key, set_code, number, card_type, grouping, source_url)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(print_key) DO UPDATE SET
      set_code = excluded.set_code,
      number = excluded.number,
      card_type = excluded.card_type,
      grouping = excluded.grouping,
      source_url = excluded.source_url
  `);
  const insertTitle = db.prepare(`
    INSERT INTO print_titles (print_key, lang, full_name, rarity)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      full_name = excluded.full_name,
      rarity = excluded.rarity
  `);
  const insertAsset = db.prepare(`
    INSERT INTO print_assets (print_key, lang, art, thumb, back, source_url, wayback_timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      art = COALESCE(excluded.art, print_assets.art),
      thumb = COALESCE(excluded.thumb, print_assets.thumb),
      back = COALESCE(excluded.back, print_assets.back),
      source_url = COALESCE(excluded.source_url, print_assets.source_url),
      wayback_timestamp = COALESCE(excluded.wayback_timestamp, print_assets.wayback_timestamp)
  `);

  db.exec("BEGIN");
  try {
    const metaInsert = db.prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    metaInsert.run("schemaVersion", NARUTO_CCG_SCHEMA_VERSION);
    metaInsert.run("game", NARUTO_GAME);
    metaInsert.run("pack", NARUTO_PACK_ID);
    metaInsert.run("generatedAt", new Date().toISOString());
    for (const [k, v] of Object.entries(input.meta ?? {})) {
      metaInsert.run(k, v);
    }

    for (const p of input.prints) {
      insertPrint.run(
        p.printKey,
        p.setCode,
        p.number,
        p.cardType,
        p.grouping ?? null,
        p.sourceUrl ?? null,
      );
    }
    for (const t of input.titles ?? []) {
      insertTitle.run(t.printKey, t.lang, t.fullName, t.rarity ?? null);
    }
    for (const a of input.assets) {
      insertAsset.run(
        a.printKey,
        a.lang,
        a.art ?? null,
        a.thumb ?? null,
        a.back ?? null,
        a.sourceUrl ?? null,
        a.waybackTimestamp ?? null,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }

  db.close();
  return { dbPath, printCount: input.prints.length };
}

export function exportNarutoCardsIndexJson(
  prints: NarutoPrintRow[],
  assets: NarutoAssetRow[],
  outPath: string,
  titles?: NarutoTitleRow[],
): CardsIndexV1 {
  const index: CardsIndexV1 = {
    version: 1,
    pack: NARUTO_PACK_ID,
    generatedAt: new Date().toISOString(),
    cards: {},
  };

  const titleByKey = new Map<string, NarutoTitleRow>();
  for (const t of titles ?? []) {
    if (t.lang.toLowerCase() !== "fr") continue;
    titleByKey.set(t.printKey, t);
  }

  for (const p of prints) {
    const title = titleByKey.get(p.printKey);
    const entry: CardsIndexEntry = {
      set: p.setCode,
      card: p.grouping ? `${p.number}-${p.grouping}` : p.number,
      langs: {},
    };
    if (title?.fullName) entry.name = title.fullName;
    if (title?.rarity) entry.rarity = title.rarity;
    index.cards[p.printKey] = entry;
  }
  for (const a of assets) {
    const entry = index.cards[a.printKey];
    if (!entry) continue;
    const lang = entry.langs[a.lang] ?? {};
    if (a.art) lang.art = a.art;
    if (a.thumb) lang.thumb = a.thumb;
    if (a.back) lang.back = a.back;
    entry.langs[a.lang] = lang;
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(index)}\n`);
  return index;
}

export function ensureNarutoCcgIndex(): DatabaseSync | null {
  const dbPath = narutoCcgDbPath();
  if (!existsSync(dbPath)) return null;
  if (activeDb) return activeDb;
  try {
    activeDb = new DatabaseSync(dbPath, { readOnly: true });
    return activeDb;
  } catch {
    return null;
  }
}

export function lookupNarutoTitle(
  printKey: string,
  lang: string,
): NarutoTitleRow | null {
  const db = ensureNarutoCcgIndex();
  if (!db) return null;
  const row = db
    .prepare(
      `SELECT print_key AS printKey, lang, full_name AS fullName, rarity
       FROM print_titles WHERE print_key = ? AND lang = ?`,
    )
    .get(printKey, lang) as
    | {
        printKey: string;
        lang: string;
        fullName: string;
        rarity: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    printKey: row.printKey,
    lang: row.lang,
    fullName: row.fullName,
    rarity: row.rarity,
  };
}
