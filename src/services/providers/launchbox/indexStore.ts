import {
  createReadStream,
  createWriteStream,
  existsSync,
  promises as fs,
} from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import { DatabaseSync } from "node:sqlite";

import {
  extractLaunchBoxBlock,
  findNextLaunchBoxBlock,
  parseLaunchBoxAlternateNameBlock,
  parseLaunchBoxGameBlock,
  parseLaunchBoxImageBlock,
  type LaunchBoxGameRecord,
} from "./parse";

export type { LaunchBoxGameRecord };

const DEFAULT_ZIP_URL = "https://gamesdb.launchbox-app.com/Metadata.zip";
export const LAUNCHBOX_INDEX_SCHEMA_VERSION = "2";

let memoryDb: DatabaseSync | null = null;
let activeDbConnection: DatabaseSync | null = null;
let indexBuildPromise: Promise<DatabaseSync | null> | null = null;

function cacheDir(): string {
  return (
    process.env.LAUNCHBOX_CACHE_DIR?.trim() ||
    path.join(process.cwd(), ".cache", "launchbox")
  );
}

function indexPath(): string {
  const customPath = process.env.LAUNCHBOX_INDEX_PATH?.trim();
  if (customPath) return customPath;
  return path.join(cacheDir(), "launchbox.sqlite");
}

function zipPath(): string {
  return path.join(cacheDir(), "Metadata.zip");
}

function metadataXmlPath(): string {
  return (
    process.env.LAUNCHBOX_METADATA_XML?.trim() ||
    path.join(cacheDir(), "Metadata.xml")
  );
}

function shouldBuildLaunchBoxIndex(): boolean {
  return true;
}

function shouldDownloadLaunchBoxZip(): boolean {
  const hasExplicitZipUrl = Boolean(
    process.env.LAUNCHBOX_METADATA_ZIP_URL?.trim(),
  );
  const hasZip = existsSync(zipPath());

  return hasExplicitZipUrl || (!hasZip && !existsSync(metadataXmlPath()));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadMetadataZip(): Promise<string | null> {
  const zipUrl =
    process.env.LAUNCHBOX_METADATA_ZIP_URL?.trim() || DEFAULT_ZIP_URL;
  await fs.mkdir(cacheDir(), { recursive: true });

  try {
    const response = await axios.get<ArrayBuffer>(zipUrl, {
      responseType: "arraybuffer",
      timeout: 10 * 60_000,
      maxContentLength: 256 * 1024 * 1024,
    });
    await fs.writeFile(zipPath(), Buffer.from(response.data));
    return zipPath();
  } catch (error) {
    console.warn("[LaunchBox] Failed to download Metadata.zip", error);
    return null;
  }
}

async function extractMetadataXmlFromZip(): Promise<string | null> {
  if (!(await fileExists(zipPath()))) {
    if (!shouldDownloadLaunchBoxZip()) {
      return null;
    }
    const downloaded = await downloadMetadataZip();
    if (!downloaded) return null;
  }

  await fs.mkdir(cacheDir(), { recursive: true });
  const target = metadataXmlPath();

  await new Promise<void>((resolve, reject) => {
    const unzip = spawn("unzip", ["-p", zipPath(), "Metadata.xml"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = createWriteStream(target);
    unzip.stdout.pipe(output);
    unzip.stderr.on("data", (chunk) => {
      console.warn("[LaunchBox] unzip:", String(chunk));
    });
    unzip.on("error", reject);
    unzip.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`unzip exited with code ${code}`));
    });
  });

  return target;
}

async function resolveMetadataXmlSource(): Promise<string | null> {
  const explicitXml = process.env.LAUNCHBOX_METADATA_XML?.trim();
  if (explicitXml) {
    if (await fileExists(explicitXml)) {
      return explicitXml;
    }
    console.warn(`[LaunchBox] Configured XML file not found: ${explicitXml}`);
  }

  const cachedXml = metadataXmlPath();
  if (await fileExists(cachedXml)) {
    return cachedXml;
  }

  return extractMetadataXmlFromZip();
}

function createIndexSchema(db: DatabaseSync): void {
  db.exec(`
    DROP TABLE IF EXISTS index_meta;
    DROP TABLE IF EXISTS games;
    DROP TABLE IF EXISTS alternate_names;
    DROP TABLE IF EXISTS game_images;
    DROP TABLE IF EXISTS games_fts;

    CREATE TABLE index_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE games (
      databaseId INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      overview TEXT,
      releaseDate TEXT,
      releaseYear TEXT,
      developer TEXT,
      publisher TEXT,
      genres TEXT,
      esrb TEXT,
      communityRating REAL,
      communityRatingCount INTEGER,
      maxPlayers INTEGER,
      releaseType TEXT,
      cooperative INTEGER,
      videoUrl TEXT,
      wikipediaUrl TEXT
    );

    CREATE TABLE alternate_names (
      gameId INTEGER NOT NULL,
      name TEXT NOT NULL,
      region TEXT,
      FOREIGN KEY(gameId) REFERENCES games(databaseId) ON DELETE CASCADE
    );

    CREATE INDEX idx_alternate_names_gameId ON alternate_names(gameId);

    CREATE TABLE game_images (
      gameId INTEGER NOT NULL,
      fileName TEXT NOT NULL,
      type TEXT NOT NULL,
      region TEXT,
      FOREIGN KEY(gameId) REFERENCES games(databaseId) ON DELETE CASCADE
    );

    CREATE INDEX idx_game_images_gameId ON game_images(gameId);

    CREATE VIRTUAL TABLE games_fts USING fts5(
      databaseId UNINDEXED,
      name,
      alternateNames
    );
  `);
}

function rebuildGamesFts(db: DatabaseSync): void {
  db.exec(`
    INSERT INTO games_fts (databaseId, name, alternateNames)
    SELECT
      g.databaseId,
      g.name,
      COALESCE((
        SELECT GROUP_CONCAT(an.name, ' ')
        FROM alternate_names an
        WHERE an.gameId = g.databaseId
      ), '')
    FROM games g
  `);
}

function isIndexSchemaCurrent(db: DatabaseSync): boolean {
  try {
    const row = db
      .prepare("SELECT value FROM index_meta WHERE key = 'schema_version'")
      .get() as { value?: string } | undefined;
    return row?.value === LAUNCHBOX_INDEX_SCHEMA_VERSION;
  } catch {
    return false;
  }
}

async function buildSqliteIndex(
  xmlFilePath: string,
  db: DatabaseSync,
): Promise<{ games: number; alternateNames: number; images: number }> {
  createIndexSchema(db);

  const insertGame = db.prepare(`
    INSERT INTO games (
      databaseId, name, platform, overview, releaseDate, releaseYear,
      developer, publisher, genres, esrb, communityRating, communityRatingCount,
      maxPlayers, releaseType, cooperative, videoUrl, wikipediaUrl
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAlt = db.prepare(`
    INSERT INTO alternate_names (gameId, name, region)
    VALUES (?, ?, ?)
  `);

  const insertImage = db.prepare(`
    INSERT INTO game_images (gameId, fileName, type, region)
    VALUES (?, ?, ?, ?)
  `);

  let games = 0;
  let alternateNames = 0;
  let images = 0;
  let buffer = "";
  let pendingCommits = 0;

  const maybeCommit = () => {
    pendingCommits += 1;
    if (pendingCommits >= 5000) {
      db.exec("COMMIT");
      db.exec("BEGIN TRANSACTION");
      pendingCommits = 0;
    }
  };

  db.exec("BEGIN TRANSACTION");

  for await (const chunk of createReadStream(xmlFilePath, {
    encoding: "utf8",
  })) {
    buffer += chunk;

    while (true) {
      const next = findNextLaunchBoxBlock(buffer);
      if (!next) break;

      const extracted = extractLaunchBoxBlock(buffer, next.tag, next.start);
      if (!extracted) break;

      buffer = extracted.rest;
      const { block } = extracted;

      if (next.tag === "Game") {
        const parsed = parseLaunchBoxGameBlock(block);
        if (parsed) {
          insertGame.run(
            parsed.databaseId,
            parsed.name,
            parsed.platform,
            parsed.overview || null,
            parsed.releaseDate || null,
            parsed.releaseYear || null,
            parsed.developer || null,
            parsed.publisher || null,
            parsed.genres ? JSON.stringify(parsed.genres) : null,
            parsed.esrb || null,
            parsed.communityRating ?? null,
            parsed.communityRatingCount ?? null,
            parsed.maxPlayers ?? null,
            parsed.releaseType || null,
            parsed.cooperative == null ? null : parsed.cooperative ? 1 : 0,
            parsed.videoUrl || null,
            parsed.wikipediaUrl || null,
          );
          games += 1;
          maybeCommit();
        }
      } else if (next.tag === "GameAlternateName") {
        const parsed = parseLaunchBoxAlternateNameBlock(block);
        if (parsed) {
          insertAlt.run(parsed.databaseId, parsed.name, parsed.region || null);
          alternateNames += 1;
          maybeCommit();
        }
      } else if (next.tag === "GameImage") {
        const parsed = parseLaunchBoxImageBlock(block);
        if (parsed) {
          insertImage.run(
            parsed.databaseId,
            parsed.fileName,
            parsed.type,
            parsed.region || null,
          );
          images += 1;
          maybeCommit();
        }
      }
    }

    if (buffer.length > 2_000_000) {
      buffer = buffer.slice(-1_000_000);
    }
  }

  db.exec("COMMIT");
  db.exec("BEGIN TRANSACTION");
  rebuildGamesFts(db);
  db.prepare(
    "INSERT INTO index_meta (key, value) VALUES ('schema_version', ?)",
  ).run(LAUNCHBOX_INDEX_SCHEMA_VERSION);
  db.exec("COMMIT");

  return { games, alternateNames, images };
}

export async function buildLaunchBoxIndex(): Promise<DatabaseSync | null> {
  const xmlPath = await resolveMetadataXmlSource();
  if (!xmlPath) return null;

  console.info(`[LaunchBox] Building SQLite index from ${xmlPath}...`);
  const file = indexPath();
  await fs.mkdir(path.dirname(file), { recursive: true });

  try {
    if (await fileExists(file)) {
      await fs.unlink(file);
    }
  } catch (err) {
    console.warn("[LaunchBox] Error unlinking old database", err);
  }

  try {
    const db = new DatabaseSync(file);
    const stats = await buildSqliteIndex(xmlPath, db);
    console.info(
      `[LaunchBox] SQLite index ready (${stats.games} games, ${stats.alternateNames} alternate names, ${stats.images} images)`,
    );

    activeDbConnection = db;

    const legacyJson = path.join(cacheDir(), "games-index.json");
    const legacySqlite = path.join(cacheDir(), "games-index.sqlite");
    try {
      if (await fileExists(legacyJson)) await fs.unlink(legacyJson);
      if (await fileExists(legacySqlite)) await fs.unlink(legacySqlite);
    } catch {}

    return db;
  } catch (error) {
    console.error("[LaunchBox] Failed to build SQLite index", error);
    return null;
  }
}

export async function ensureLaunchBoxIndex(): Promise<DatabaseSync | null> {
  if (memoryDb) return memoryDb;
  if (activeDbConnection) return activeDbConnection;

  const file = indexPath();
  if (await fileExists(file)) {
    try {
      const db = new DatabaseSync(file);
      if (isIndexSchemaCurrent(db)) {
        activeDbConnection = db;
        return activeDbConnection;
      }

      console.info(
        `[LaunchBox] Index schema outdated — rebuilding to v${LAUNCHBOX_INDEX_SCHEMA_VERSION}`,
      );
      activeDbConnection = null;
    } catch (error) {
      console.warn("[LaunchBox] Failed to open SQLite database", error);
    }
  }

  if (!shouldBuildLaunchBoxIndex()) {
    return null;
  }

  if (!indexBuildPromise) {
    indexBuildPromise = buildLaunchBoxIndex().finally(() => {
      indexBuildPromise = null;
    });
  }

  return indexBuildPromise;
}

export function __resetLaunchBoxIndexForTests(): void {
  memoryDb = null;
  activeDbConnection = null;
  indexBuildPromise = null;
}

export function __setLaunchBoxIndexForTests(
  games: LaunchBoxGameRecord[] | null,
): void {
  if (games === null) {
    memoryDb = null;
    return;
  }

  memoryDb = new DatabaseSync(":memory:");
  createIndexSchema(memoryDb);

  const insertGame = memoryDb.prepare(`
    INSERT INTO games (
      databaseId, name, platform, overview, releaseDate, releaseYear,
      developer, publisher, genres, esrb, communityRating, communityRatingCount,
      maxPlayers, releaseType, cooperative, videoUrl, wikipediaUrl
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAlt = memoryDb.prepare(`
    INSERT INTO alternate_names (gameId, name, region)
    VALUES (?, ?, ?)
  `);

  const insertImage = memoryDb.prepare(`
    INSERT INTO game_images (gameId, fileName, type, region)
    VALUES (?, ?, ?, ?)
  `);

  memoryDb.exec("BEGIN TRANSACTION");
  for (const game of games) {
    insertGame.run(
      game.databaseId,
      game.name,
      game.platform,
      game.overview || null,
      game.releaseDate || null,
      game.releaseYear || null,
      game.developer || null,
      game.publisher || null,
      game.genres ? JSON.stringify(game.genres) : null,
      game.esrb || null,
      game.communityRating ?? null,
      game.communityRatingCount ?? null,
      game.maxPlayers ?? null,
      game.releaseType || null,
      game.cooperative == null ? null : game.cooperative ? 1 : 0,
      game.videoUrl || null,
      game.wikipediaUrl || null,
    );

    for (const alt of game.alternateNames) {
      insertAlt.run(game.databaseId, alt.name, alt.region || null);
    }

    for (const image of game.images) {
      insertImage.run(
        game.databaseId,
        image.fileName,
        image.type,
        image.region || null,
      );
    }
  }

  rebuildGamesFts(memoryDb);
  memoryDb
    .prepare("INSERT INTO index_meta (key, value) VALUES ('schema_version', ?)")
    .run(LAUNCHBOX_INDEX_SCHEMA_VERSION);
  memoryDb.exec("COMMIT");
}

export function hashLaunchBoxQuery(value: string): string {
  const { createHash } = require("node:crypto");
  return createHash("sha1").update(value.normalize("NFKC")).digest("hex");
}

export function getLaunchBoxCacheDir(): string {
  return cacheDir();
}

export function getLaunchBoxIndexPath(): string {
  return indexPath();
}

export function getLaunchBoxDefaultTempDir(): string {
  return path.join(os.tmpdir(), "placarr-launchbox");
}
