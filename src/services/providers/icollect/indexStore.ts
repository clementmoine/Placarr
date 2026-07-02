import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { cleanCode } from "@/lib/barcode/query";

export const ICOLLECT_INDEX_SCHEMA_VERSION = "1";
const METADATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function barcodeMatchKey(value?: string | null): string {
  return cleanCode(value).replace(/^0+/, "");
}

export type ICollectBarcodeIndexEntry = {
  barcodeKey: string;
  rawBarcode: string;
  itemId: string;
  itemUrl: string;
};

export type ICollectCachedMetadata = {
  itemId: string;
  payload: string;
  fetchedAt: number;
};

let activeDb: DatabaseSync | null = null;
let indexInitPromise: Promise<DatabaseSync | null> | null = null;

function cacheDir(): string {
  return (
    process.env.ICOLLECT_CACHE_DIR?.trim() ||
    path.join(process.cwd(), ".cache", "icollect")
  );
}

export function icollectIndexPath(): string {
  const customPath = process.env.ICOLLECT_INDEX_PATH?.trim();
  if (customPath) return customPath;
  return path.join(cacheDir(), "videogames.sqlite");
}

function isIndexSchemaCurrent(db: DatabaseSync): boolean {
  try {
    const row = db
      .prepare("SELECT value FROM index_meta WHERE key = 'schema_version'")
      .get() as { value?: string } | undefined;
    return row?.value === ICOLLECT_INDEX_SCHEMA_VERSION;
  } catch {
    return false;
  }
}

function createIndexSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS index_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS barcode_index (
      barcode_key TEXT PRIMARY KEY,
      raw_barcode TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_url TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_barcode_index_item_id ON barcode_index(item_id);

    CREATE TABLE IF NOT EXISTS item_metadata (
      item_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
  `);

  db.prepare(
    "INSERT INTO index_meta(key, value) VALUES('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(ICOLLECT_INDEX_SCHEMA_VERSION);
}

export function extractBarcodeEntriesFromSitemapXml(
  xml: string,
): ICollectBarcodeIndexEntry[] {
  const entries: ICollectBarcodeIndexEntry[] = [];

  for (const urlMatch of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = urlMatch[1];
    const locMatch = block.match(
      /<loc>(https:\/\/www\.icollecteverything\.com\/db\/item\/videogame\/(\d+)\/)<\/loc>/i,
    );
    if (!locMatch) continue;

    const itemUrl = locMatch[1];
    const itemId = locMatch[2];
    const seenKeys = new Set<string>();

    for (const barcodeMatch of block.matchAll(/\[Barcode\s+([0-9]+)\]/gi)) {
      const rawBarcode = barcodeMatch[1];
      const barcodeKey = barcodeMatchKey(rawBarcode);
      if (!barcodeKey || seenKeys.has(barcodeKey)) continue;
      seenKeys.add(barcodeKey);
      entries.push({
        barcodeKey,
        rawBarcode,
        itemId,
        itemUrl,
      });
    }
  }

  return entries;
}

function openDatabase(filePath: string): DatabaseSync {
  const db = new DatabaseSync(filePath);
  if (!isIndexSchemaCurrent(db)) {
    createIndexSchema(db);
  }
  return db;
}

export async function ensureICollectIndex(): Promise<DatabaseSync | null> {
  if (activeDb) return activeDb;
  if (indexInitPromise) return indexInitPromise;

  indexInitPromise = (async () => {
    await fs.mkdir(cacheDir(), { recursive: true });
    const filePath = icollectIndexPath();
    if (!existsSync(filePath)) {
      const db = new DatabaseSync(filePath);
      createIndexSchema(db);
      activeDb = db;
      return db;
    }

    activeDb = openDatabase(filePath);
    return activeDb;
  })().finally(() => {
    indexInitPromise = null;
  });

  return indexInitPromise;
}

export function lookupICollectItemUrlByBarcodeKey(
  db: DatabaseSync,
  barcodeKey: string,
): string | null {
  if (!barcodeKey) return null;
  const row = db
    .prepare("SELECT item_url FROM barcode_index WHERE barcode_key = ?")
    .get(barcodeKey) as { item_url?: string } | undefined;
  return row?.item_url ?? null;
}

export function rememberICollectBarcodeMappings(
  db: DatabaseSync,
  entries: ICollectBarcodeIndexEntry[],
): number {
  if (entries.length === 0) return 0;

  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO barcode_index (barcode_key, raw_barcode, item_id, item_url, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(barcode_key) DO UPDATE SET
      raw_barcode = excluded.raw_barcode,
      item_id = excluded.item_id,
      item_url = excluded.item_url,
      updated_at = excluded.updated_at
  `);

  let changes = 0;
  for (const entry of entries) {
    const result = insert.run(
      entry.barcodeKey,
      entry.rawBarcode,
      entry.itemId,
      entry.itemUrl,
      now,
    );
    changes += Number(result.changes || 0);
  }
  return changes;
}

export function rememberICollectBarcodeMapping(
  db: DatabaseSync,
  barcode: string,
  itemUrl: string,
): void {
  const itemId = itemUrl.match(/\/videogame\/(\d+)\/?$/i)?.[1];
  if (!itemId) return;

  rememberICollectBarcodeMappings(db, [
    {
      barcodeKey: barcodeMatchKey(barcode),
      rawBarcode: barcode.replace(/[^\d]/g, ""),
      itemId,
      itemUrl,
    },
  ]);
}

export function readCachedICollectMetadata(
  db: DatabaseSync,
  itemId: string,
  maxAgeMs = METADATA_TTL_MS,
): string | null {
  const row = db
    .prepare("SELECT payload, fetched_at FROM item_metadata WHERE item_id = ?")
    .get(itemId) as { payload?: string; fetched_at?: number } | undefined;
  if (!row?.payload || typeof row.fetched_at !== "number") return null;
  if (Date.now() - row.fetched_at > maxAgeMs) return null;
  return row.payload;
}

export function writeCachedICollectMetadata(
  db: DatabaseSync,
  itemId: string,
  payload: string,
): void {
  db.prepare(`
    INSERT INTO item_metadata (item_id, payload, fetched_at)
    VALUES (?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      payload = excluded.payload,
      fetched_at = excluded.fetched_at
  `).run(itemId, payload, Date.now());
}

export function countICollectBarcodeIndex(db: DatabaseSync): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM barcode_index")
    .get() as { count?: number } | undefined;
  return Number(row?.count || 0);
}

export async function ingestICollectSitemapXml(
  db: DatabaseSync,
  xml: string,
): Promise<number> {
  const entries = extractBarcodeEntriesFromSitemapXml(xml);
  return rememberICollectBarcodeMappings(db, entries);
}

export function resetICollectIndexForTests(): void {
  activeDb?.close();
  activeDb = null;
  indexInitPromise = null;
}
