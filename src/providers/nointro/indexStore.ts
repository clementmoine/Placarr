/**
 * No-Intro local SQLite index — build from Logiqx DAT XML (prebuild only).
 * Scan path opens an existing index; never downloads DATs.
 * admin Local indexes may sync a DAT pack zip first (allowDownload).
 */
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  parseNoIntroDatXml,
  type NoIntroDatGame,
  type NoIntroDatRom,
} from "./parseDat";

export const NOINTRO_INDEX_SCHEMA_VERSION = "1";

export type NoIntroIndexedGame = {
  id: number;
  name: string;
  description?: string;
  cloneOf?: string;
  datName: string;
  roms: NoIntroDatRom[];
};

export type NoIntroChecksumQuery = {
  crc?: string | null;
  md5?: string | null;
  sha1?: string | null;
};

let memoryDb: DatabaseSync | null = null;
let activeDbConnection: DatabaseSync | null = null;

function cacheDir(): string {
  return (
    process.env.NOINTRO_CACHE_DIR?.trim() ||
    path.join(process.cwd(), "data", "nointro")
  );
}

function indexPath(): string {
  const customPath = process.env.NOINTRO_INDEX_PATH?.trim();
  if (customPath) return customPath;
  return path.join(cacheDir(), "nointro.sqlite");
}

export function getNoIntroIndexPath(): string {
  return indexPath();
}

function configuredDatPath(): string | null {
  return process.env.NOINTRO_DAT_PATH?.trim() || null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeChecksum(value?: string | null): string | null {
  const cleaned = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-f0-9]/g, "");
  return cleaned || null;
}

/** FTS-facing text: strip diacritics so "Pokémon" matches "pokemon". */
export function ftsNormalizeNoIntroText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createIndexSchema(db: DatabaseSync): void {
  db.exec(`
    DROP TABLE IF EXISTS index_meta;
    DROP TABLE IF EXISTS roms;
    DROP TABLE IF EXISTS games;
    DROP TABLE IF EXISTS games_fts;

    CREATE TABLE index_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE games (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      cloneOf TEXT,
      datName TEXT NOT NULL
    );

    CREATE TABLE roms (
      id INTEGER PRIMARY KEY,
      gameId INTEGER NOT NULL,
      name TEXT NOT NULL,
      size INTEGER,
      crc TEXT,
      md5 TEXT,
      sha1 TEXT,
      status TEXT,
      FOREIGN KEY(gameId) REFERENCES games(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_roms_crc ON roms(crc);
    CREATE INDEX idx_roms_md5 ON roms(md5);
    CREATE INDEX idx_roms_sha1 ON roms(sha1);
    CREATE INDEX idx_roms_gameId ON roms(gameId);

    CREATE VIRTUAL TABLE games_fts USING fts5(
      gameId UNINDEXED,
      name,
      description
    );
  `);
}

function rebuildGamesFts(db: DatabaseSync): void {
  db.exec(`DELETE FROM games_fts`);
  const rows = db
    .prepare(`SELECT id, name, description FROM games`)
    .all() as Array<{
    id: number;
    name: string;
    description: string | null;
  }>;
  const insertFts = db.prepare(`
    INSERT INTO games_fts (gameId, name, description)
    VALUES (?, ?, ?)
  `);
  for (const row of rows) {
    insertFts.run(
      row.id,
      ftsNormalizeNoIntroText(row.name),
      ftsNormalizeNoIntroText(row.description || ""),
    );
  }
}

function isIndexSchemaCurrent(db: DatabaseSync): boolean {
  try {
    const row = db
      .prepare("SELECT value FROM index_meta WHERE key = 'schema_version'")
      .get() as { value?: string } | undefined;
    return row?.value === NOINTRO_INDEX_SCHEMA_VERSION;
  } catch {
    return false;
  }
}

function insertDatGames(
  db: DatabaseSync,
  games: NoIntroDatGame[],
  datName: string,
  startId: number,
): { nextId: number; games: number; roms: number } {
  const insertGame = db.prepare(`
    INSERT INTO games (id, name, description, cloneOf, datName)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertRom = db.prepare(`
    INSERT INTO roms (gameId, name, size, crc, md5, sha1, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let id = startId;
  let romCount = 0;
  for (const game of games) {
    insertGame.run(
      id,
      game.name,
      game.description ?? null,
      game.cloneOf ?? null,
      datName,
    );
    for (const rom of game.roms) {
      insertRom.run(
        id,
        rom.name,
        rom.size ?? null,
        normalizeChecksum(rom.crc),
        normalizeChecksum(rom.md5),
        normalizeChecksum(rom.sha1),
        rom.status ?? null,
      );
      romCount += 1;
    }
    id += 1;
  }
  return { nextId: id, games: games.length, roms: romCount };
}

/** Build / replace schema and load games from one parsed DAT. */
export function loadNoIntroDatIntoDb(
  db: DatabaseSync,
  xml: string,
  options?: { datName?: string; replaceSchema?: boolean; startId?: number },
): { games: number; roms: number; nextId: number } {
  if (options?.replaceSchema !== false) {
    createIndexSchema(db);
  }
  const parsed = parseNoIntroDatXml(xml);
  const datName =
    options?.datName?.trim() || parsed.header.name?.trim() || "Unknown DAT";
  const startId = options?.startId ?? 1;
  db.exec("BEGIN TRANSACTION");
  const stats = insertDatGames(db, parsed.games, datName, startId);
  if (options?.replaceSchema !== false) {
    rebuildGamesFts(db);
    db.prepare(
      "INSERT INTO index_meta (key, value) VALUES ('schema_version', ?)",
    ).run(NOINTRO_INDEX_SCHEMA_VERSION);
  }
  db.exec("COMMIT");
  return {
    games: stats.games,
    roms: stats.roms,
    nextId: stats.nextId,
  };
}

export type NoIntroIndexBuildOptions = {
  /**
   * Path to a Logiqx `.dat` / `.xml` file **or** a directory of them.
   * Defaults to `NOINTRO_DAT_PATH`.
   */
  datPath?: string;
  /**
   * Intentional prebuild (admin Local indexes) — may sync a DAT pack zip
   * (local `NOINTRO_DAT_PACK` or URL when download is allowed).
   */
  allowDownload?: boolean;
  /** Local zip path override (else `NOINTRO_DAT_PACK`). */
  packPath?: string;
  /** Remote zip URL override (else `NOINTRO_DAT_PACK_URL`). */
  packUrl?: string;
};

const DAT_FILE_RE = /\.(dat|xml)$/i;

/** Resolve one DAT file or every `.dat`/`.xml` in a directory (sorted). */
export async function resolveNoIntroDatFiles(
  rootPath: string,
): Promise<string[]> {
  const trimmed = rootPath.trim();
  if (!trimmed) return [];
  if (!(await fileExists(trimmed))) return [];

  const stat = await fs.stat(trimmed);
  if (stat.isFile()) {
    return DAT_FILE_RE.test(trimmed) ? [trimmed] : [];
  }
  if (!stat.isDirectory()) return [];

  const entries = await fs.readdir(trimmed);
  return entries
    .filter((entry) => DAT_FILE_RE.test(entry))
    .map((entry) => path.join(trimmed, entry))
    .sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Prefer existing DAT files; otherwise sync a pack when allowed (LaunchBox parity).
 */
async function resolveDatRootForBuild(
  options?: NoIntroIndexBuildOptions,
): Promise<string | null> {
  const explicit = options?.datPath?.trim() || configuredDatPath();
  if (explicit) {
    const existing = await resolveNoIntroDatFiles(explicit);
    if (existing.length > 0) return explicit;
  }

  const { syncNoIntroDatPack } = await import("./syncDatPack");
  const synced = await syncNoIntroDatPack({
    allowDownload: options?.allowDownload,
    packPath: options?.packPath,
    packUrl: options?.packUrl,
    destDir: explicit || undefined,
  });
  if (synced?.destDir) return synced.destDir;

  return explicit;
}

/** Prebuild SQLite from local DAT file(s), optionally syncing a pack first. */
export async function buildNoIntroIndex(
  options?: NoIntroIndexBuildOptions,
): Promise<DatabaseSync | null> {
  const datPath = await resolveDatRootForBuild(options);
  if (!datPath) {
    console.warn(
      "[No-Intro] No DAT path — set NOINTRO_DAT_PATH, or NOINTRO_DAT_PACK / URL, then admin Local indexes",
    );
    return null;
  }

  const files = await resolveNoIntroDatFiles(datPath);
  if (files.length === 0) {
    console.warn(
      `[No-Intro] No .dat/.xml files found at ${datPath} — sync No-Intro from admin Local indexes with a pack or DAT path`,
    );
    return null;
  }

  const file = indexPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    if (await fileExists(file)) await fs.unlink(file);
  } catch (error) {
    console.warn("[No-Intro] Error unlinking old database", error);
  }

  try {
    console.info(
      `[No-Intro] Building SQLite index from ${files.length} DAT file(s)...`,
    );
    const db = new DatabaseSync(file);
    createIndexSchema(db);

    let nextId = 1;
    let totalGames = 0;
    let totalRoms = 0;
    for (const datFile of files) {
      console.info(`[No-Intro] Loading ${datFile}`);
      const xml = await fs.readFile(datFile, "utf8");
      const stats = loadNoIntroDatIntoDb(db, xml, {
        replaceSchema: false,
        startId: nextId,
      });
      nextId = stats.nextId;
      totalGames += stats.games;
      totalRoms += stats.roms;
    }

    db.exec("BEGIN TRANSACTION");
    rebuildGamesFts(db);
    db.prepare(
      "INSERT INTO index_meta (key, value) VALUES ('schema_version', ?)",
    ).run(NOINTRO_INDEX_SCHEMA_VERSION);
    db.exec("COMMIT");

    console.info(
      `[No-Intro] SQLite index ready (${totalGames} games, ${totalRoms} roms from ${files.length} DAT(s))`,
    );
    activeDbConnection = db;
    return db;
  } catch (error) {
    console.error("[No-Intro] Failed to build SQLite index", error);
    return null;
  }
}

/** Open existing index only — no build / download at scan. */
export async function ensureNoIntroIndex(): Promise<DatabaseSync | null> {
  if (memoryDb) return memoryDb;
  if (activeDbConnection) return activeDbConnection;

  const file = indexPath();
  if (!(await fileExists(file))) {
    console.info("[No-Intro] Index unavailable — sync No-Intro from admin Local indexes");
    return null;
  }

  try {
    const db = new DatabaseSync(file);
    if (!isIndexSchemaCurrent(db)) {
      console.info(
        `[No-Intro] Index schema outdated — rebuild from admin Local indexes (v${NOINTRO_INDEX_SCHEMA_VERSION})`,
      );
      db.close();
      return null;
    }
    activeDbConnection = db;
    return activeDbConnection;
  } catch (error) {
    console.warn("[No-Intro] Failed to open SQLite database", error);
    return null;
  }
}

function loadRomsForGame(db: DatabaseSync, gameId: number): NoIntroDatRom[] {
  const rows = db
    .prepare(
      `SELECT name, size, crc, md5, sha1, status FROM roms WHERE gameId = ?`,
    )
    .all(gameId) as Array<{
    name: string;
    size: number | null;
    crc: string | null;
    md5: string | null;
    sha1: string | null;
    status: string | null;
  }>;
  return rows.map((row) => ({
    name: row.name,
    size: row.size ?? undefined,
    crc: row.crc ?? undefined,
    md5: row.md5 ?? undefined,
    sha1: row.sha1 ?? undefined,
    status: row.status ?? undefined,
  }));
}

function mapGameRow(
  db: DatabaseSync,
  row: {
    id: number;
    name: string;
    description: string | null;
    cloneOf: string | null;
    datName: string;
  },
): NoIntroIndexedGame {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    cloneOf: row.cloneOf ?? undefined,
    datName: row.datName,
    roms: loadRomsForGame(db, row.id),
  };
}

/** Exact checksum lookup (crc / md5 / sha1). Prefers sha1 > md5 > crc. */
export function lookupNoIntroGamesByChecksum(
  db: DatabaseSync,
  query: NoIntroChecksumQuery,
): NoIntroIndexedGame[] {
  const sha1 = normalizeChecksum(query.sha1);
  const md5 = normalizeChecksum(query.md5);
  const crc = normalizeChecksum(query.crc);
  if (!sha1 && !md5 && !crc) return [];

  let sql = `
    SELECT DISTINCT g.id, g.name, g.description, g.cloneOf, g.datName
    FROM games g
    INNER JOIN roms r ON r.gameId = g.id
    WHERE
  `;
  const params: string[] = [];
  if (sha1) {
    sql += " r.sha1 = ?";
    params.push(sha1);
  } else if (md5) {
    sql += " r.md5 = ?";
    params.push(md5);
  } else {
    sql += " r.crc = ?";
    params.push(crc!);
  }
  sql += " ORDER BY g.id LIMIT 20";

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    name: string;
    description: string | null;
    cloneOf: string | null;
    datName: string;
  }>;
  return rows.map((row) => mapGameRow(db, row));
}

function tokenizeTitleQuery(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 || /^\d+$/.test(token));
}

function ftsPrefixToken(token: string): string | null {
  const safe = token.replace(/[^a-z0-9]/g, "");
  return safe ? `${safe}*` : null;
}

/** Title FTS search over indexed game names. */
export function searchNoIntroGamesByTitle(
  db: DatabaseSync,
  query: string,
  limit = 8,
): NoIntroIndexedGame[] {
  const tokens = tokenizeTitleQuery(query)
    .map(ftsPrefixToken)
    .filter((token): token is string => Boolean(token));
  if (tokens.length === 0) return [];

  const match = tokens.join(" AND ");
  const rows = db
    .prepare(
      `
      SELECT g.id, g.name, g.description, g.cloneOf, g.datName
      FROM games_fts
      INNER JOIN games g ON g.id = games_fts.gameId
      WHERE games_fts MATCH ?
      LIMIT ?
    `,
    )
    .all(match, Math.max(1, Math.min(limit, 50))) as Array<{
    id: number;
    name: string;
    description: string | null;
    cloneOf: string | null;
    datName: string;
  }>;
  return rows.map((row) => mapGameRow(db, row));
}

export function __resetNoIntroIndexForTests(): void {
  memoryDb = null;
  activeDbConnection = null;
}

/** In-memory index from DAT XML for unit tests. */
export function __setNoIntroIndexFromXmlForTests(xml: string): DatabaseSync {
  memoryDb = new DatabaseSync(":memory:");
  loadNoIntroDatIntoDb(memoryDb, xml);
  return memoryDb;
}

export function __noIntroPathsForTests() {
  return {
    cacheDir: cacheDir(),
    indexPath: indexPath(),
    datPath: configuredDatPath(),
    exists: existsSync,
  };
}
