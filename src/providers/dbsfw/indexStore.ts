/**
 * Fusion World local catalogue — `data/dbs/fw/catalog.sqlite`.
 * Faces stay on Bandai's FW CDN (SAMPLE watermark); we index metadata.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { dataRoot } from "@/lib/runtimeData";
import { packCardDir } from "@/lib/packPaths";

import {
  DBS_FW_FACE_DECISION_FILE,
  parseFwFaceDecision,
  type DbsFwFaceRole,
} from "./faceChoice";
import { DBS_FW_GAME } from "./printIdentity";

export const DBS_FW_SCHEMA_VERSION = "1";
export const DBS_FW_PACK_ID = "dbs/fw";

export type DbsFwPrintRow = {
  printKey: string;
  setCode: string;
  number: string;
  grouping?: string | null;
  sourceUrl?: string | null;
};

export type DbsFwTitleRow = {
  printKey: string;
  lang: string;
  fullName: string;
  setName?: string | null;
};

export type DbsFwAssetRow = {
  printKey: string;
  lang: string;
  imageUrl?: string | null;
};

let activeDb: DatabaseSync | null = null;

export function dbsFwDbPath(): string {
  const override = process.env.PLACARR_DBSFW_DB?.trim();
  if (override) return path.resolve(override);
  return path.join(dataRoot(), DBS_FW_PACK_ID, "catalog.sqlite");
}

export function resetDbsFwDbCache(): void {
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
      source_url TEXT
    );

    CREATE TABLE print_titles (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      full_name TEXT NOT NULL,
      set_name TEXT,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );

    CREATE TABLE print_assets (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      image_url TEXT,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );
  `);
}

export function writeDbsFwIndex(input: {
  prints: DbsFwPrintRow[];
  titles?: DbsFwTitleRow[];
  assets: DbsFwAssetRow[];
  dbPath?: string;
  meta?: Record<string, string>;
}): { dbPath: string; printCount: number } {
  const dbPath = input.dbPath ?? dbsFwDbPath();
  resetDbsFwDbCache();
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
    INSERT INTO prints (print_key, set_code, number, grouping, source_url)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(print_key) DO UPDATE SET
      set_code = excluded.set_code,
      number = excluded.number,
      grouping = excluded.grouping,
      source_url = excluded.source_url
  `);
  const insertTitle = db.prepare(`
    INSERT INTO print_titles (print_key, lang, full_name, set_name)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      full_name = excluded.full_name,
      set_name = excluded.set_name
  `);
  const insertAsset = db.prepare(`
    INSERT INTO print_assets (print_key, lang, image_url)
    VALUES (?, ?, ?)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      image_url = COALESCE(excluded.image_url, print_assets.image_url)
  `);

  db.exec("BEGIN");
  try {
    const metaInsert = db.prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    metaInsert.run("schemaVersion", DBS_FW_SCHEMA_VERSION);
    metaInsert.run("game", DBS_FW_GAME);
    metaInsert.run("pack", DBS_FW_PACK_ID);
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
        print.sourceUrl ?? null,
      );
    }
    for (const title of input.titles ?? []) {
      insertTitle.run(
        title.printKey,
        title.lang,
        title.fullName,
        title.setName ?? null,
      );
    }
    for (const asset of input.assets) {
      insertAsset.run(asset.printKey, asset.lang, asset.imageUrl ?? null);
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

export function ensureDbsFwIndex(): DatabaseSync | null {
  const dbPath = dbsFwDbPath();
  if (!existsSync(dbPath)) return null;
  if (activeDb) return activeDb;
  try {
    activeDb = new DatabaseSync(dbPath, { readOnly: true });
    return activeDb;
  } catch {
    return null;
  }
}

export function exportDbsFwCardsIndexJson(
  prints: DbsFwPrintRow[],
  titles: DbsFwTitleRow[] | undefined,
  assets: DbsFwAssetRow[] | undefined,
  outPath: string,
): void {
  const titleByKey = new Map<string, DbsFwTitleRow>();
  for (const title of titles ?? []) {
    titleByKey.set(title.printKey, title);
  }
  const assetByKey = new Map<string, DbsFwAssetRow>();
  for (const asset of assets ?? []) {
    if (!asset.imageUrl) continue;
    assetByKey.set(asset.printKey, asset);
  }
  const cards: Record<
    string,
    {
      set: string;
      card: string;
      name?: string;
      langs: Record<string, { artUrl: string }>;
    }
  > = {};
  for (const print of prints) {
    const title = titleByKey.get(print.printKey);
    const asset = assetByKey.get(print.printKey);
    const card = print.grouping
      ? `${print.number}-${print.grouping}`
      : print.number;
    const lang = (asset?.lang ?? title?.lang ?? "en").toLowerCase();
    cards[print.printKey] = {
      set: print.setCode,
      card,
      langs: asset?.imageUrl ? { [lang]: { artUrl: asset.imageUrl } } : {},
      ...(title?.fullName ? { name: title.fullName } : {}),
    };
  }
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(
    `${outPath}`,
    `${JSON.stringify({ version: 1, pack: DBS_FW_PACK_ID, generatedAt: new Date().toISOString(), cards }, null, 0)}\n`,
  );
}

/**
 * The folder one printing owns, under `cards/<set>/<lang>/`.
 *
 * A parallel (`_p1`) is a different printing with different art, so it gets its
 * own folder rather than overwriting the base card's face.
 */
export function dbsFwCardFolder(
  print: Pick<DbsFwPrintRow, "number" | "grouping">,
): string {
  return print.grouping ? `${print.number}-${print.grouping}` : print.number;
}

/**
 * The synced face for one printing *in its own language*.
 *
 * Locale is a parameter, not a constant: English and Japanese are different
 * printings with different art, and a card must show its own.
 */
export function dbsFwLocalArtFilename(
  print: Pick<DbsFwPrintRow, "setCode" | "number" | "grouping">,
  lang = "en",
  role: DbsFwFaceRole = "art",
): string | null {
  const cardDir = packCardDir(DBS_FW_PACK_ID, {
    set: print.setCode,
    lang: lang.toLowerCase(),
    card: dbsFwCardFolder(print),
  });
  const decision = path.join(cardDir, DBS_FW_FACE_DECISION_FILE);
  if (!existsSync(decision)) return null;
  try {
    const named = parseFwFaceDecision(readFileSync(decision, "utf8"), role);
    if (named && existsSync(path.join(cardDir, named))) return named;
  } catch {
    /* unreadable decision — the remote URL still stands in */
  }
  return null;
}

export function dbsFwLocalBackFilename(
  print: Pick<DbsFwPrintRow, "setCode" | "number" | "grouping">,
  lang = "en",
): string | null {
  return dbsFwLocalArtFilename(print, lang, "back");
}

/** Everything the faces pass needs, in one read. */
export function loadDbsFwIndex(): {
  prints: DbsFwPrintRow[];
  titles: DbsFwTitleRow[];
  assets: DbsFwAssetRow[];
} | null {
  const db = ensureDbsFwIndex();
  if (!db) return null;
  try {
    const prints = db
      .prepare(
        `SELECT print_key AS printKey, set_code AS setCode, number, grouping,
                source_url AS sourceUrl
           FROM prints
          ORDER BY set_code, number, grouping`,
      )
      .all() as DbsFwPrintRow[];
    const titles = db
      .prepare(
        `SELECT print_key AS printKey, lang, full_name AS fullName,
                set_name AS setName
           FROM print_titles`,
      )
      .all() as DbsFwTitleRow[];
    const assets = db
      .prepare(
        `SELECT print_key AS printKey, lang, image_url AS imageUrl
           FROM print_assets`,
      )
      .all() as DbsFwAssetRow[];
    return { prints, titles, assets };
  } catch {
    return null;
  }
}
