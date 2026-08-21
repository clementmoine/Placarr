/**
 * Catalogue Pokémon **local**, sous `data/pokemon/prints.sqlite`.
 *
 * Pourquoi un fichier à part, alors que les autres packs mettent leurs tirages
 * dans `catalog.sqlite` : ce nom est déjà pris côté Pokémon par le magasin du
 * client TCG Live (`live_cards`, `card_foil`), et son écrivain **réécrit le
 * fichier entier** à chaque synchro — temporaire puis remplacement. Des tables
 * de tirages posées là disparaîtraient à la moisson suivante, sans un bruit.
 *
 * Les deux magasins ne disent d'ailleurs pas la même chose : celui de Live dit
 * *comment une carte brille*, celui-ci dit *ce qu'elle est*. C'est ce second
 * qui manquait — l'identité des cartes venait de l'API tcgdex, en distant, et
 * une recherche par nom devait donc sortir sur le réseau.
 *
 * Une entrée par **carte et par langue** : le même tirage s'appelle
 * « Mystherbe » en français et « Oddish » en anglais, et les deux se cherchent.
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  finalizeSetOptions,
  isAnsweredQuery,
  setScopedWhere,
} from "@/providers/shared/cardCatalogue/sets";

import { dataRoot } from "@/lib/runtimeData";

export type TcgdexPrintRow = {
  printKey: string;
  setId: string;
  localId: string;
  providerId: string;
  imageBaseUrl: string | null;
};

export type TcgdexTitleRow = {
  printKey: string;
  lang: string;
  name: string;
  setName: string | null;
  serieName: string | null;
};

export type TcgdexSetRow = {
  setId: string;
  lang: string;
  name: string;
  serieName: string | null;
  releasedAt: string | null;
  totalCount: number | null;
};

/** Une ligne de recherche : le tirage et son titre, joints. */
export type TcgdexSearchRow = {
  printKey: string;
  setId: string;
  localId: string;
  providerId: string;
  imageBaseUrl: string | null;
  lang: string;
  name: string;
  setName: string | null;
  serieName: string | null;
};

export function tcgdexDbPath(): string {
  return path.join(dataRoot(), "pokemon", "prints.sqlite");
}

let activeDb: DatabaseSync | null = null;
let activePath: string | null = null;

export function resetTcgdexIndexCache(): void {
  try {
    activeDb?.close();
  } catch {
    /* déjà fermée */
  }
  activeDb = null;
  activePath = null;
}

function createSchema(db: DatabaseSync): void {
  /*
    `IF NOT EXISTS`, jamais de `DROP` : la moisson est **incrémentale**. Un jeu
    qui sort encore se rattrape set par set, et repartir de zéro à chaque passe
    coûterait deux cents requêtes pour retrouver ce qu'on avait déjà.
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS prints (
      print_key TEXT PRIMARY KEY,
      set_id TEXT NOT NULL,
      local_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      image_base_url TEXT
    );

    CREATE TABLE IF NOT EXISTS print_titles (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      name TEXT NOT NULL,
      set_name TEXT,
      serie_name TEXT,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sets (
      set_id TEXT NOT NULL,
      lang TEXT NOT NULL,
      name TEXT NOT NULL,
      serie_name TEXT,
      released_at TEXT,
      total_count INTEGER,
      harvested_at TEXT,
      PRIMARY KEY (set_id, lang)
    );

    CREATE INDEX IF NOT EXISTS idx_prints_set ON prints(set_id);
    CREATE INDEX IF NOT EXISTS idx_titles_name ON print_titles(name);
  `);
}

export function writeTcgdexSet(input: {
  set: TcgdexSetRow;
  prints: readonly TcgdexPrintRow[];
  titles: readonly TcgdexTitleRow[];
  dbPath?: string;
}): { prints: number; titles: number } {
  const dbPath = input.dbPath ?? tcgdexDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 30000");
    createSchema(db);
    const insertPrint = db.prepare(`
      INSERT INTO prints (print_key, set_id, local_id, provider_id, image_base_url)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(print_key) DO UPDATE SET
        set_id = excluded.set_id,
        local_id = excluded.local_id,
        provider_id = excluded.provider_id,
        -- Une image déjà connue ne se perd pas parce qu'une langue l'omet.
        image_base_url = COALESCE(excluded.image_base_url, prints.image_base_url)
    `);
    const insertTitle = db.prepare(`
      INSERT INTO print_titles (print_key, lang, name, set_name, serie_name)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(print_key, lang) DO UPDATE SET
        name = excluded.name,
        set_name = excluded.set_name,
        serie_name = excluded.serie_name
    `);
    const insertSet = db.prepare(`
      INSERT INTO sets (set_id, lang, name, serie_name, released_at, total_count, harvested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(set_id, lang) DO UPDATE SET
        name = excluded.name,
        serie_name = excluded.serie_name,
        released_at = excluded.released_at,
        total_count = excluded.total_count,
        harvested_at = excluded.harvested_at
    `);

    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of input.prints) {
        insertPrint.run(
          row.printKey,
          row.setId,
          row.localId,
          row.providerId,
          row.imageBaseUrl,
        );
      }
      for (const row of input.titles) {
        insertTitle.run(
          row.printKey,
          row.lang,
          row.name,
          row.setName,
          row.serieName,
        );
      }
      insertSet.run(
        input.set.setId,
        input.set.lang,
        input.set.name,
        input.set.serieName,
        input.set.releasedAt,
        input.set.totalCount,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { prints: input.prints.length, titles: input.titles.length };
  } finally {
    db.close();
    resetTcgdexIndexCache();
  }
}

export function ensureTcgdexIndex(): DatabaseSync | null {
  const dbPath = tcgdexDbPath();
  if (!existsSync(dbPath)) return null;
  if (activeDb && activePath === dbPath) return activeDb;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  activeDb = db;
  activePath = dbPath;
  return db;
}

/**
 * Ce qui est déjà moissonné, par set et par langue.
 *
 * Sert au rattrapage : un set dont le compte annoncé est atteint n'est pas
 * redemandé. C'est ce qui rend la moisson incrémentale plutôt qu'un
 * recommencement de deux cents requêtes à chaque passe.
 */
export function tcgdexHarvestedSets(): Map<string, number> {
  const db = ensureTcgdexIndex();
  if (!db) return new Map();
  const rows = db
    .prepare(
      `SELECT s.set_id AS setId, s.lang, COUNT(t.print_key) AS held
         FROM sets s
         LEFT JOIN prints p ON p.set_id = s.set_id
         LEFT JOIN print_titles t
                ON t.print_key = p.print_key AND t.lang = s.lang
        GROUP BY s.set_id, s.lang`,
    )
    .all() as { setId: string; lang: string; held: number }[];
  return new Map(rows.map((row) => [`${row.setId}|${row.lang}`, row.held]));
}

export function searchTcgdexRows(
  query: string,
  opts: { language?: string; limit?: number; setId?: string | null } = {},
): TcgdexSearchRow[] {
  const db = ensureTcgdexIndex();
  if (!db) return [];

  const trimmed = query.trim().toLowerCase();
  const setId = opts.setId?.trim().toLowerCase();
  // Une extension seule est une question complète : « montre-moi ce set ».
  if (!isAnsweredQuery(trimmed, setId)) return [];

  const lang = (opts.language || "fr").toLowerCase();
  const limit = Math.max(1, Math.min(opts.limit ?? 40, 200));
  const like = `%${trimmed}%`;

  const scope = setScopedWhere({
    setColumn: "p.set_id",
    setId,
    textClause: trimmed
      ? `LOWER(t.name) LIKE ?
           OR LOWER(p.print_key) LIKE ?
           OR LOWER(p.set_id || '-' || p.local_id) LIKE ?`
      : null,
    textParams: [like, like, like],
  });

  return db
    .prepare(
      `SELECT p.print_key AS printKey, p.set_id AS setId,
              p.local_id AS localId, p.provider_id AS providerId,
              p.image_base_url AS imageBaseUrl,
              t.lang, t.name, t.set_name AS setName, t.serie_name AS serieName
         FROM prints p
         JOIN print_titles t ON t.print_key = p.print_key
        WHERE ${scope.where}
        ORDER BY (t.lang = ?) DESC, p.set_id, CAST(p.local_id AS INTEGER)
        LIMIT ?`,
    )
    .all(...scope.params, lang, limit * 4) as TcgdexSearchRow[];
}

/**
 * Les extensions du catalogue local, nommées dans la langue demandée.
 *
 * Un `MIN()` sur toutes les langues rendrait le premier par ordre alphabétique
 * — donc de l'anglais à un utilisateur français, alors que le nom français est
 * dans la même table.
 */
export function listTcgdexLocalSets(
  language = "fr",
): { id: string; label: string }[] {
  const db = ensureTcgdexIndex();
  if (!db) return [];
  const lang = language.trim().toLowerCase();
  const rows = db
    .prepare(
      `SELECT set_id AS setId,
              COALESCE(
                MIN(CASE WHEN lang = ? THEN NULLIF(TRIM(name), '') END),
                MIN(NULLIF(TRIM(name), ''))
              ) AS name
         FROM sets
        GROUP BY set_id`,
    )
    .all(lang) as { setId: string; name: string | null }[];
  return finalizeSetOptions(
    rows.map((row) => ({ id: row.setId, label: row.name })),
  );
}

/**
 * Retire du catalogue les sets qu'on ne sert pas.
 *
 * Une étagère tient du carton : les sets 100 % numériques n'y entrent pas. Le
 * filtre vit désormais à la moisson, mais une base déjà écrite les contient —
 * et un catalogue qui garde ce qu'il refuse de servir finit toujours par le
 * servir quand même, au premier chemin de lecture qui oublie le filtre.
 */
export function pruneTcgdexSets(
  setIds: readonly string[],
  dbPath = tcgdexDbPath(),
): number {
  if (setIds.length === 0 || !existsSync(dbPath)) return 0;
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 30000");
    const dropTitles = db.prepare(
      `DELETE FROM print_titles
        WHERE print_key IN (SELECT print_key FROM prints WHERE LOWER(set_id) = ?)`,
    );
    const dropPrints = db.prepare(`DELETE FROM prints WHERE LOWER(set_id) = ?`);
    const dropSet = db.prepare(`DELETE FROM sets WHERE LOWER(set_id) = ?`);
    let removed = 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const raw of setIds) {
        const setId = raw.trim().toLowerCase();
        if (!setId) continue;
        dropTitles.run(setId);
        const result = dropPrints.run(setId);
        dropSet.run(setId);
        removed += Number(result.changes ?? 0);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return removed;
  } finally {
    db.close();
    resetTcgdexIndexCache();
  }
}
