/**
 * Index SQLite d'une ligne de cartes locale — même forme partout
 * (`prints` / `print_titles` / `print_assets`).
 *
 * Un pack vide a le droit d'exister : le schéma et un `cards-index.json` à
 * zéro carte disent « pas encore ingéré », ce qui est vrai. Inventer une
 * première carte pour que le catalogue « ait l'air peuplé » serait un faux
 * positif.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { CardsIndexEntry, CardsIndexV1 } from "@/effects/cardsIndex";
import { packCardsIndexPath, packCatalogDb } from "@/lib/packPaths";

import { SET_ENUMERATION_LIMIT } from "./setPrints";
import { finalizeSetOptions, isAnsweredQuery, setScopedWhere } from "./sets";

export type LocalPrintSearchRow = {
  printKey: string;
  setCode: string;
  number: string;
  cardType: string;
  grouping: string | null;
  lang: string;
  fullName: string | null;
  rarity: string | null;
  art: string | null;
  thumb: string | null;
  back: string | null;
};

/** Face attestée — le fichier est déjà sous `cards/`, on n'enregistre que le nom. */
export type LocalPrintAssetWrite = {
  printKey: string;
  lang: string;
  art?: string;
  back?: string;
  sourceUrl?: string | null;
};

/** Une ligne à poser dans l'index — titres attestés, faces plus tard. */
export type LocalPrintWrite = {
  printKey: string;
  setCode: string;
  number: string;
  cardType: string;
  grouping?: string | null;
  sourceUrl?: string | null;
  titles: readonly {
    lang: string;
    fullName: string;
    rarity?: string | null;
  }[];
};

export type LocalPrintsIndex = {
  packId: string;
  dbPath: () => string;
  resetCache: () => void;
  ensure: () => DatabaseSync | null;
  openForWrite: () => DatabaseSync;
  searchRows: (
    query: string,
    opts?: { language?: string; limit?: number; setId?: string | null },
  ) => LocalPrintSearchRow[];
  lookupRow: (printKey: string, opts?: { language?: string }) => LocalPrintSearchRow | null;
  listSets: (opts?: {
    setLabel?: (setCode: string) => string;
    setSortKey?: (setCode: string) => number | null;
    languages?: readonly string[];
  }) => { id: string; label: string }[];
  writePrints: (rows: readonly LocalPrintWrite[]) => {
    prints: number;
    titles: number;
  };
  writeAssets: (rows: readonly LocalPrintAssetWrite[]) => { assets: number };
  exportIndex: () => { path: string; cards: number } | null;
  /**
   * Crée le schéma et l'index JSON, même à zéro carte. C'est ce qui rend un
   * onglet Catalogue ouvrable avant la première moisson.
   */
  bootstrapEmpty: () => { path: string; cards: number };
};

const SELECT_ROW = `SELECT p.print_key AS printKey, p.set_code AS setCode, p.number,
              p.card_type AS cardType, p.grouping,
              t.lang, t.full_name AS fullName, t.rarity,
              a.art, a.thumb, a.back
         FROM prints p
         LEFT JOIN print_titles t ON t.print_key = p.print_key
         LEFT JOIN print_assets a
                ON a.print_key = p.print_key AND a.lang = t.lang`;

/*
  Les faces dont la langue n'a pas de titre.

  `SELECT_ROW` apparie face et titre par la langue. Une face dans une langue que
  les titres ne couvrent pas tombe donc de l'index — elle est sur le disque, elle
  est en base, et elle n'apparaît nulle part. Mesuré le 2026-08-22 : 262 faces du
  Carddass et 4 des 17 du 疾風伝 étaient perdues ainsi.

  Or la langue d'une face et celle d'un titre sont deux faits **indépendants** :
  avoir le scan d'un tirage italien n'oblige pas à connaître son nom italien.
  Cette seconde requête récupère ces faces orphelines ; elles entrent dans
  l'index avec leur image et sans nom, ce que `CardsIndexEntry` permet déjà.
*/
const SELECT_ORPHAN_ASSETS = `SELECT a.print_key AS printKey, p.card_type AS cardType,
              p.number, a.lang, a.art, a.thumb, a.back
         FROM print_assets a
         JOIN prints p ON p.print_key = a.print_key
        WHERE NOT EXISTS (
              SELECT 1 FROM print_titles t
               WHERE t.print_key = a.print_key AND t.lang = a.lang)`;

export function createPrintsSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prints (
      print_key TEXT PRIMARY KEY,
      set_code TEXT NOT NULL,
      number TEXT NOT NULL,
      card_type TEXT NOT NULL,
      grouping TEXT,
      source_url TEXT
    );

    CREATE TABLE IF NOT EXISTS print_titles (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      full_name TEXT NOT NULL,
      rarity TEXT,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS print_assets (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      art TEXT,
      thumb TEXT,
      back TEXT,
      source_url TEXT,
      printed INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_prints_set ON prints(set_code);
  `);
}

export function createLocalPrintsIndex(packId: string): LocalPrintsIndex {
  let activeDb: DatabaseSync | null = null;
  let activePath: string | null = null;

  const dbPath = () => packCatalogDb(packId);

  const resetCache = () => {
    try {
      activeDb?.close();
    } catch {
      /* déjà fermée */
    }
    activeDb = null;
    activePath = null;
  };

  const ensure = (): DatabaseSync | null => {
    const file = dbPath();
    if (!existsSync(file)) return null;
    if (activeDb && activePath === file) return activeDb;
    const db = new DatabaseSync(file, { readOnly: true });
    activeDb = db;
    activePath = file;
    return db;
  };

  const openForWrite = (): DatabaseSync => {
    const file = dbPath();
    mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    createPrintsSchema(db);
    return db;
  };

  const searchRows = (
    query: string,
    opts: { language?: string; limit?: number; setId?: string | null } = {},
  ): LocalPrintSearchRow[] => {
    const db = ensure();
    if (!db) return [];

    const trimmed = query.trim().toLowerCase();
    const setId = opts.setId?.trim();
    if (!isAnsweredQuery(trimmed, setId)) return [];

    const lang = (opts.language || "fr").toLowerCase();
    const limit = Math.max(
      1,
      Math.min(opts.limit ?? 40, SET_ENUMERATION_LIMIT),
    );
    const like = `%${trimmed}%`;
    const compact = trimmed.replace(/[\s-]/g, "");

    const scope = setScopedWhere({
      setColumn: "p.set_code",
      setId,
      textClause: trimmed
        ? `LOWER(t.full_name) LIKE ?
           OR LOWER(p.print_key) LIKE ?
           OR LOWER(p.number) LIKE ?`
        : null,
      textParams: [like, like, `%${compact}%`],
    });

    return db
      .prepare(
        `${SELECT_ROW}
        WHERE ${scope.where}
        ORDER BY (t.lang = ?) DESC, p.card_type, CAST(p.number AS INTEGER)
        LIMIT ?`,
      )
      .all(...scope.params, lang, limit * 3) as LocalPrintSearchRow[];
  };

  const lookupRow = (
    printKey: string,
    opts?: { language?: string },
  ): LocalPrintSearchRow | null => {
    const db = ensure();
    if (!db) return null;
    const key = printKey.trim().toLowerCase();
    const lang = opts?.language?.trim().toLowerCase();
    if (lang) {
      const titled = db
        .prepare(`${SELECT_ROW} WHERE p.print_key = ? AND t.lang = ? LIMIT 1`)
        .get(key, lang) as LocalPrintSearchRow | undefined;
      if (titled) return titled;
      const orphan = db
        .prepare(
          `SELECT a.print_key AS printKey, p.card_type AS cardType,
                  p.number, a.lang, a.art, a.thumb, a.back
             FROM print_assets a
             JOIN prints p ON p.print_key = a.print_key
            WHERE a.print_key = ? AND a.lang = ?
              AND NOT EXISTS (
                    SELECT 1 FROM print_titles t
                     WHERE t.print_key = a.print_key AND t.lang = a.lang)
            LIMIT 1`,
        )
        .get(key, lang) as LocalPrintSearchRow | undefined;
      if (orphan) {
        const print = db
          .prepare(
            `SELECT set_code AS setCode, number, card_type AS cardType, grouping
               FROM prints WHERE print_key = ? LIMIT 1`,
          )
          .get(key) as
          | { setCode: string; number: string; cardType: string; grouping: string | null }
          | undefined;
        if (!print) return null;
        return {
          printKey: key,
          setCode: print.setCode,
          number: print.number,
          cardType: print.cardType,
          grouping: print.grouping,
          lang,
          fullName: null,
          rarity: null,
          art: orphan.art,
          thumb: orphan.thumb,
          back: orphan.back,
        };
      }
    }
    const row = db
      .prepare(`${SELECT_ROW} WHERE p.print_key = ? LIMIT 1`)
      .get(key) as LocalPrintSearchRow | undefined;
    return row ?? null;
  };

  const listSets = (opts?: {
    setLabel?: (setCode: string) => string;
    setSortKey?: (setCode: string) => number | null;
    languages?: readonly string[];
  }) => {
    const db = ensure();
    if (!db) return [];
    const rows = db
      .prepare(
        `SELECT DISTINCT set_code AS setCode FROM prints
          WHERE set_code IS NOT NULL AND TRIM(set_code) <> ''`,
      )
      .all() as { setCode: string }[];
    const label =
      opts?.setLabel ?? ((code: string) => code.trim().toUpperCase());
    const languages = opts?.languages ? [...opts.languages] : undefined;
    return finalizeSetOptions(
      rows
        .filter((row) => row.setCode.trim().toLowerCase() !== "unknown")
        .map((row) => ({
          id: row.setCode,
          label: label(row.setCode),
          sortKey: opts?.setSortKey?.(row.setCode) ?? null,
          ...(languages ? { languages } : {}),
        })),
    );
  };

  const writePrints = (
    rows: readonly LocalPrintWrite[],
  ): { prints: number; titles: number } => {
    const db = openForWrite();
    let titles = 0;
    try {
      const insertPrint = db.prepare(
        `INSERT INTO prints (print_key, set_code, number, card_type, grouping, source_url)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(print_key) DO UPDATE SET
           set_code = excluded.set_code,
           number = excluded.number,
           card_type = excluded.card_type,
           grouping = excluded.grouping,
           source_url = excluded.source_url`,
      );
      const insertTitle = db.prepare(
        `INSERT INTO print_titles (print_key, lang, full_name, rarity)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(print_key, lang) DO UPDATE SET
           full_name = excluded.full_name,
           rarity = excluded.rarity`,
      );
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const row of rows) {
          insertPrint.run(
            row.printKey,
            row.setCode,
            row.number,
            row.cardType,
            row.grouping ?? null,
            row.sourceUrl ?? null,
          );
          for (const title of row.titles) {
            const name = title.fullName.trim();
            if (!name) continue;
            insertTitle.run(
              row.printKey,
              title.lang.trim().toLowerCase(),
              name,
              title.rarity?.trim() || null,
            );
            titles += 1;
          }
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      db.close();
      resetCache();
    }
    return { prints: rows.length, titles };
  };

  const writeAssets = (
    rows: readonly LocalPrintAssetWrite[],
  ): { assets: number } => {
    const db = openForWrite();
    let assets = 0;
    try {
      const upsert = db.prepare(
        `INSERT INTO print_assets (print_key, lang, art, back, source_url, printed)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(print_key, lang) DO UPDATE SET
           art = COALESCE(excluded.art, print_assets.art),
           back = COALESCE(excluded.back, print_assets.back),
           source_url = COALESCE(excluded.source_url, print_assets.source_url)`,
      );
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const row of rows) {
          const art = row.art?.trim() || null;
          const back = row.back?.trim() || null;
          if (!art && !back) continue;
          upsert.run(
            row.printKey,
            row.lang.trim().toLowerCase(),
            art,
            back,
            row.sourceUrl ?? null,
          );
          assets += 1;
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      db.close();
      resetCache();
    }
    return { assets };
  };

  const exportIndex = (): { path: string; cards: number } | null => {
    const db = ensure();
    if (!db) return null;
    const rows = db.prepare(SELECT_ROW).all() as LocalPrintSearchRow[];

    const cards: Record<string, CardsIndexEntry> = {};
    for (const row of rows) {
      const entry = (cards[row.printKey] ??= {
        set: row.cardType,
        card: row.number,
        langs: {},
      });
      if (!row.lang) continue;
      const slot = entry.langs[row.lang] ?? {};
      if (row.fullName) slot.name = row.fullName;
      if (row.art) slot.art = row.art;
      if (row.thumb) slot.thumb = row.thumb;
      if (row.back) slot.back = row.back;
      entry.langs[row.lang] = slot;
      if (!entry.name && row.fullName) entry.name = row.fullName;
      if (!entry.rarity && row.rarity) entry.rarity = row.rarity;
    }

    // Puis les faces dont la langue n'a pas de titre : sans elles, un scan
    // honnêtement étiqueté disparaîtrait pour n'avoir pas de nom traduit.
    const orphans = db
      .prepare(SELECT_ORPHAN_ASSETS)
      .all() as LocalPrintSearchRow[];
    for (const row of orphans) {
      if (!row.lang || (!row.art && !row.thumb && !row.back)) continue;
      const entry = (cards[row.printKey] ??= {
        set: row.cardType,
        card: row.number,
        langs: {},
      });
      const slot = entry.langs[row.lang] ?? {};
      if (row.art) slot.art = row.art;
      if (row.thumb) slot.thumb = row.thumb;
      if (row.back) slot.back = row.back;
      entry.langs[row.lang] = slot;
    }

    const dest = packCardsIndexPath(packId);
    mkdirSync(path.dirname(dest), { recursive: true });
    const index: CardsIndexV1 = {
      version: 1,
      pack: packId,
      generatedAt: new Date().toISOString(),
      cards,
    };
    writeFileSync(dest, `${JSON.stringify(index)}\n`);
    return { path: dest, cards: Object.keys(cards).length };
  };

  const bootstrapEmpty = (): { path: string; cards: number } => {
    const db = openForWrite();
    db.close();
    resetCache();
    const written = exportIndex();
    if (written) return written;
    /*
      `exportIndex` lit en lecture seule : si la base vient d'être créée, le
      cache doit la revoir. Une seconde passe après `resetCache` suffit.
      Zéro carte reste un catalogue honnête.
    */
    const again = exportIndex();
    if (again) return again;
    const dest = packCardsIndexPath(packId);
    mkdirSync(path.dirname(dest), { recursive: true });
    const index: CardsIndexV1 = {
      version: 1,
      pack: packId,
      generatedAt: new Date().toISOString(),
      cards: {},
    };
    writeFileSync(dest, `${JSON.stringify(index)}\n`);
    return { path: dest, cards: 0 };
  };

  return {
    packId,
    dbPath,
    resetCache,
    ensure,
    openForWrite,
    searchRows,
    lookupRow,
    listSets,
    writePrints,
    writeAssets,
    exportIndex,
    bootstrapEmpty,
  };
}
