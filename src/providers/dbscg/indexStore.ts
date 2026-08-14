/**
 * DBS Masters local catalogue — `data/dbs/cg/catalog.sqlite`.
 * Bandai SAMPLE URLs stay in `print_assets`; local Deckplanet faces are
 * `cards/{set}/fr/{card}/art.webp` when the faces step has run.
 */
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { CardsIndexLangFiles } from "@/effects/cardsIndex";
import { packCardDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";

import { DBS_CG_GAME } from "./printIdentity";

export const DBS_CG_SCHEMA_VERSION = "1";
export const DBS_CG_PACK_ID = "dbs/cg";

export type DbsPrintRow = {
  printKey: string;
  setCode: string;
  number: string;
  grouping?: string | null;
  cardType?: string | null;
  sourceUrl?: string | null;
};

export type DbsTitleRow = {
  printKey: string;
  lang: string;
  fullName: string;
  rarity?: string | null;
  setName?: string | null;
  color?: string | null;
  character?: string | null;
  power?: string | null;
  awakenedName?: string | null;
};

export type DbsAssetRow = {
  printKey: string;
  lang: string;
  imageUrl?: string | null;
  backUrl?: string | null;
};

let activeDb: DatabaseSync | null = null;

export function dbsCgDbPath(): string {
  const override = process.env.PLACARR_DBSCG_DB?.trim();
  if (override) return path.resolve(override);
  return path.join(dataRoot(), DBS_CG_PACK_ID, "catalog.sqlite");
}

export function resetDbsCgDbCache(): void {
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
      grouping TEXT,
      card_type TEXT,
      source_url TEXT
    );

    CREATE TABLE print_titles (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      full_name TEXT NOT NULL,
      rarity TEXT,
      set_name TEXT,
      color TEXT,
      character TEXT,
      power TEXT,
      awakened_name TEXT,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );

    CREATE TABLE print_assets (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      image_url TEXT,
      back_url TEXT,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );
  `);
}

export function writeDbsCgIndex(input: {
  prints: DbsPrintRow[];
  titles?: DbsTitleRow[];
  assets: DbsAssetRow[];
  dbPath?: string;
  meta?: Record<string, string>;
}): { dbPath: string; printCount: number } {
  const dbPath = input.dbPath ?? dbsCgDbPath();
  resetDbsCgDbCache();
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
    INSERT INTO prints (print_key, set_code, number, grouping, card_type, source_url)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(print_key) DO UPDATE SET
      set_code = excluded.set_code,
      number = excluded.number,
      grouping = excluded.grouping,
      card_type = excluded.card_type,
      source_url = excluded.source_url
  `);
  const insertTitle = db.prepare(`
    INSERT INTO print_titles (
      print_key, lang, full_name, rarity, set_name, color, character, power, awakened_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      full_name = excluded.full_name,
      rarity = excluded.rarity,
      set_name = excluded.set_name,
      color = excluded.color,
      character = excluded.character,
      power = excluded.power,
      awakened_name = excluded.awakened_name
  `);
  const insertAsset = db.prepare(`
    INSERT INTO print_assets (print_key, lang, image_url, back_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      image_url = COALESCE(excluded.image_url, print_assets.image_url),
      back_url = COALESCE(excluded.back_url, print_assets.back_url)
  `);

  db.exec("BEGIN");
  try {
    const metaInsert = db.prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    metaInsert.run("schemaVersion", DBS_CG_SCHEMA_VERSION);
    metaInsert.run("game", DBS_CG_GAME);
    metaInsert.run("pack", DBS_CG_PACK_ID);
    metaInsert.run("generatedAt", new Date().toISOString());
    for (const [key, value] of Object.entries(input.meta ?? {})) {
      metaInsert.run(key, value);
    }

    for (const print of input.prints) {
      insertPrint.run(
        print.printKey,
        print.setCode,
        print.number,
        print.grouping ?? null,
        print.cardType ?? null,
        print.sourceUrl ?? null,
      );
    }
    for (const title of input.titles ?? []) {
      insertTitle.run(
        title.printKey,
        title.lang,
        title.fullName,
        title.rarity ?? null,
        title.setName ?? null,
        title.color ?? null,
        title.character ?? null,
        title.power ?? null,
        title.awakenedName ?? null,
      );
    }
    for (const asset of input.assets) {
      insertAsset.run(
        asset.printKey,
        asset.lang,
        asset.imageUrl ?? null,
        asset.backUrl ?? null,
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

export function ensureDbsCgIndex(): DatabaseSync | null {
  const dbPath = dbsCgDbPath();
  if (!existsSync(dbPath)) return null;
  if (activeDb) return activeDb;
  try {
    activeDb = new DatabaseSync(dbPath, { readOnly: true });
    return activeDb;
  } catch {
    return null;
  }
}

/** Catalogue folder for one print: `001` or `011-spr`. */
export function dbsCgCardFolder(
  print: Pick<DbsPrintRow, "number" | "grouping">,
): string {
  return print.grouping ? `${print.number}-${print.grouping}` : print.number;
}

export function dbsCgLocalArtFilename(
  print: Pick<DbsPrintRow, "setCode" | "number" | "grouping">,
): string | null {
  const art = path.join(
    packCardDir(DBS_CG_PACK_ID, {
      set: print.setCode,
      lang: "fr",
      card: dbsCgCardFolder(print),
    }),
    "art.webp",
  );
  return existsSync(art) ? "art.webp" : null;
}

export function loadDbsCgIndex(): {
  prints: DbsPrintRow[];
  titles: DbsTitleRow[];
  assets: DbsAssetRow[];
} | null {
  const db = ensureDbsCgIndex();
  if (!db) return null;
  try {
    const prints = db
      .prepare(
        `SELECT print_key AS printKey, set_code AS setCode, number, grouping,
                card_type AS cardType, source_url AS sourceUrl
           FROM prints
          ORDER BY set_code, number, grouping`,
      )
      .all() as DbsPrintRow[];
    const titles = db
      .prepare(
        `SELECT print_key AS printKey, lang, full_name AS fullName, rarity,
                set_name AS setName, color, character, power,
                awakened_name AS awakenedName
           FROM print_titles`,
      )
      .all() as DbsTitleRow[];
    const assets = db
      .prepare(
        `SELECT print_key AS printKey, lang, image_url AS imageUrl,
                back_url AS backUrl
           FROM print_assets`,
      )
      .all() as DbsAssetRow[];
    return { prints, titles, assets };
  } catch {
    return null;
  }
}

export function exportDbsCgCardsIndexJson(
  prints: DbsPrintRow[],
  titles: DbsTitleRow[] | undefined,
  assets: DbsAssetRow[] | undefined,
  outPath: string,
): void {
  const titleByKey = new Map<string, DbsTitleRow>();
  for (const title of titles ?? []) {
    if (title.lang.toLowerCase() !== "fr") continue;
    titleByKey.set(title.printKey, title);
  }
  const cards: Record<
    string,
    {
      set: string;
      card: string;
      name?: string;
      rarity?: string;
      langs: Record<string, CardsIndexLangFiles>;
    }
  > = {};
  const assetByKey = new Map<string, DbsAssetRow>();
  for (const asset of assets ?? []) {
    if (asset.lang.toLowerCase() !== "fr") continue;
    if (!asset.imageUrl) continue;
    assetByKey.set(asset.printKey, asset);
  }
  for (const print of prints) {
    const title = titleByKey.get(print.printKey);
    const card = dbsCgCardFolder(print);
    const imageUrl = assetByKey.get(print.printKey)?.imageUrl;
    const art = dbsCgLocalArtFilename(print);
    const fr: CardsIndexLangFiles = {};
    if (art) fr.art = art;
    if (imageUrl) fr.artUrl = imageUrl;
    cards[print.printKey] = {
      set: print.setCode,
      card,
      langs: Object.keys(fr).length ? { fr } : {},
      ...(title?.fullName ? { name: title.fullName } : {}),
      ...(title?.rarity ? { rarity: title.rarity } : {}),
    };
  }
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(
    `${outPath}`,
    `${JSON.stringify({ version: 1, pack: DBS_CG_PACK_ID, generatedAt: new Date().toISOString(), cards }, null, 0)}\n`,
  );
}
