/**
 * Naruto CCG local catalogue — `data/naruto/carddass/catalog.sqlite` + cards-index.json.
 * Closed corpus (Wayback carddass.fr). Server/script only.
 */
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { japaneseVolumeForPrintNumber } from "./japaneseVolumes";

import type { CardsIndexEntry, CardsIndexV1 } from "@/effects/cardsIndex";
import { canonicalDataPack } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";

import { canonicalizeNarutoPrintKey } from "./collectorIdentity";
import { foldNarutoCatalogueRecords } from "./foldNarutoIndex";
import { NARUTO_EN_PACK_ID, NARUTO_PACK_ID } from "./packs";
import { NARUTO_GAME } from "./parseCarddassAsset";
import { isNarutoLangPrinted } from "./printed";

export const NARUTO_CCG_SCHEMA_VERSION = "2";
export { NARUTO_EN_PACK_ID, NARUTO_PACK_ID };

export type NarutoPrintRow = {
  printKey: string;
  /** Appearance (s1, s28, promo) — not the printKey set segment. */
  setCode: string;
  number: string;
  cardType: string;
  /** Folder family (`ninja`) when known. */
  family?: string | null;
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
  /** False = unprinted locale (S6 FR). Omitted / true = addable. */
  printed?: boolean;
};

const activeDbs = new Map<string, DatabaseSync>();

export function narutoPackDbPath(packId: string = NARUTO_PACK_ID): string {
  if (packId === NARUTO_PACK_ID) {
    const override = process.env.PLACARR_NARUTO_DB?.trim();
    if (override) return path.resolve(override);
  }
  return path.join(dataRoot(), canonicalDataPack(packId), "catalog.sqlite");
}

export function narutoCcgDbPath(): string {
  return narutoPackDbPath(NARUTO_PACK_ID);
}

export function resetNarutoCcgDbCache(): void {
  for (const db of activeDbs.values()) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  activeDbs.clear();
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
      printed INTEGER NOT NULL DEFAULT 1,
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
  pack?: string;
  meta?: Record<string, string>;
}): { dbPath: string; printCount: number } {
  const pack = input.pack ?? NARUTO_PACK_ID;
  const dbPath = input.dbPath ?? narutoPackDbPath(pack);
  resetNarutoCcgDbCache();
  if (existsSync(dbPath)) {
    try {
      unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  }
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const folded = foldNarutoCatalogueRecords({
    prints: input.prints,
    titles: input.titles,
    assets: input.assets,
  });

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
    INSERT INTO print_assets (print_key, lang, art, thumb, back, source_url, wayback_timestamp, printed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      art = COALESCE(excluded.art, print_assets.art),
      thumb = COALESCE(excluded.thumb, print_assets.thumb),
      back = COALESCE(excluded.back, print_assets.back),
      source_url = COALESCE(excluded.source_url, print_assets.source_url),
      wayback_timestamp = COALESCE(excluded.wayback_timestamp, print_assets.wayback_timestamp),
      printed = excluded.printed
  `);

  db.exec("BEGIN");
  try {
    const metaInsert = db.prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    metaInsert.run("schemaVersion", NARUTO_CCG_SCHEMA_VERSION);
    metaInsert.run("game", NARUTO_GAME);
    metaInsert.run("pack", pack);
    metaInsert.run("generatedAt", new Date().toISOString());
    for (const [k, v] of Object.entries(input.meta ?? {})) {
      metaInsert.run(k, v);
    }

    for (const p of folded.prints) {
      insertPrint.run(
        p.printKey,
        p.setCode,
        p.number,
        p.cardType,
        p.grouping ?? null,
        p.sourceUrl ?? null,
      );
    }
    for (const t of folded.titles) {
      insertTitle.run(t.printKey, t.lang, t.fullName, t.rarity ?? null);
    }
    for (const a of folded.assets) {
      insertAsset.run(
        a.printKey,
        a.lang,
        a.art ?? null,
        a.thumb ?? null,
        a.back ?? null,
        a.sourceUrl ?? null,
        a.waybackTimestamp ?? null,
        a.printed === false ? 0 : 1,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }

  db.close();
  return { dbPath, printCount: folded.prints.length };
}

export function exportNarutoCardsIndexJson(
  prints: NarutoPrintRow[],
  assets: NarutoAssetRow[],
  outPath: string,
  titles?: NarutoTitleRow[],
  pack: string = NARUTO_PACK_ID,
): CardsIndexV1 {
  const folded = foldNarutoCatalogueRecords({ prints, titles, assets });
  const index: CardsIndexV1 = {
    version: 1,
    pack,
    generatedAt: new Date().toISOString(),
    cards: {},
  };

  const titlesByPrint = new Map<string, NarutoTitleRow[]>();
  for (const t of folded.titles) {
    const list = titlesByPrint.get(t.printKey) ?? [];
    list.push(t);
    titlesByPrint.set(t.printKey, list);
  }

  for (const p of folded.prints) {
    const printTitles = titlesByPrint.get(p.printKey) ?? [];
    const preferred =
      printTitles.find((t) => t.lang.toLowerCase() === "fr") ??
      printTitles.find((t) => t.lang.toLowerCase() === "en") ??
      printTitles[0];
    const entry: CardsIndexEntry = {
      set: p.family || p.setCode,
      card: p.number,
      langs: {},
    };
    if (preferred?.fullName) entry.name = preferred.fullName;
    if (preferred?.rarity) entry.rarity = preferred.rarity;
    /*
      Le set japonais se dérive du numéro imprimé, pas de `set_code`.

      `set_code` porte le découpage **européen** — ce qu'on a acheté en
      boutique — et une série française empaquette deux à trois 巻ノ. Résultat
      mesuré avant correction : 21 volumes japonais sur 25 éclatés sur
      plusieurs sets. La numérotation japonaise, elle, est continue sur toute
      la ligne et chaque sortie a ouvert une plage connue : c'est elle qui
      range la carte, et elle seule.
    */
    const japaneseSet = japaneseVolumeForPrintNumber(p.number)?.setCode;
    for (const t of printTitles) {
      const code = t.lang.toLowerCase();
      const slot = entry.langs[code] ?? {};
      if (t.fullName) slot.name = t.fullName;
      if (code === "ja" && japaneseSet) slot.set = japaneseSet;
      if (isNarutoLangPrinted(p.setCode, code) === false) slot.printed = false;
      entry.langs[code] = slot;
    }
    index.cards[p.printKey] = entry;
  }
  for (const a of folded.assets) {
    const entry = index.cards[a.printKey];
    if (!entry) continue;
    const lang = entry.langs[a.lang] ?? {};
    if (a.art) lang.art = a.art;
    if (a.thumb) lang.thumb = a.thumb;
    if (a.back) lang.back = a.back;
    if (a.printed === false) lang.printed = false;
    entry.langs[a.lang] = lang;
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(index)}\n`);
  return index;
}

export function ensureNarutoPackIndex(
  packId: string = NARUTO_PACK_ID,
): DatabaseSync | null {
  const hit = activeDbs.get(packId);
  if (hit) return hit;
  const dbPath = narutoPackDbPath(packId);
  if (!existsSync(dbPath)) return null;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    activeDbs.set(packId, db);
    return db;
  } catch {
    return null;
  }
}

export function ensureNarutoCcgIndex(): DatabaseSync | null {
  return (
    ensureNarutoPackIndex(NARUTO_PACK_ID) ??
    ensureNarutoPackIndex(NARUTO_EN_PACK_ID)
  );
}

export function narutoIndexPacks(): string[] {
  const packs = new Set<string>();
  for (const id of [NARUTO_PACK_ID, NARUTO_EN_PACK_ID]) {
    const disk = canonicalDataPack(id);
    if (existsSync(narutoPackDbPath(disk))) packs.add(disk);
  }
  return [...packs];
}

export function lookupNarutoTitle(
  printKey: string,
  lang: string,
): NarutoTitleRow | null {
  const keys = [...new Set([printKey, canonicalizeNarutoPrintKey(printKey)])];
  for (const pack of narutoIndexPacks()) {
    const db = ensureNarutoPackIndex(pack);
    if (!db) continue;
    for (const key of keys) {
      const row = db
        .prepare(
          `SELECT print_key AS printKey, lang, full_name AS fullName, rarity
           FROM print_titles WHERE print_key = ? AND lang = ?`,
        )
        .get(key, lang) as
        | {
            printKey: string;
            lang: string;
            fullName: string;
            rarity: string | null;
          }
        | undefined;
      if (!row) continue;
      return {
        printKey: row.printKey,
        lang: row.lang,
        fullName: row.fullName,
        rarity: row.rarity,
      };
    }
  }
  return null;
}
