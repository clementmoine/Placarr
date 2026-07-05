import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { cleanCode } from "@/lib/barcode/query";

import type { ICollectMetadata } from "./types";
import { mergeICollectCatalogMetadata } from "./mergeCatalog";

export const DEFAULT_PAGE_CATALOG_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

export const ICOLLECT_INDEX_SCHEMA_VERSION = "2";
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

export type ICollectSitemapBlock = {
  itemId: string;
  itemUrl: string;
  title?: string;
  coverUrl?: string;
  images: Array<{ url: string; label?: string }>;
  barcodes: Array<{ barcodeKey: string; rawBarcode: string }>;
};

export type ICollectIngestStats = {
  barcodeUpserts: number;
  catalogUpserts: number;
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

function readSchemaVersion(db: DatabaseSync): string | null {
  try {
    const row = db
      .prepare("SELECT value FROM index_meta WHERE key = 'schema_version'")
      .get() as { value?: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function isIndexSchemaCurrent(db: DatabaseSync): boolean {
  return readSchemaVersion(db) === ICOLLECT_INDEX_SCHEMA_VERSION;
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

function migrateIndexSchema(db: DatabaseSync): void {
  const version = readSchemaVersion(db);
  if (!version) {
    createIndexSchema(db);
    return;
  }
  if (version === ICOLLECT_INDEX_SCHEMA_VERSION) return;
  db.prepare(
    "INSERT INTO index_meta(key, value) VALUES('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(ICOLLECT_INDEX_SCHEMA_VERSION);
}

export function parseTitleFromSitemapCaption(
  caption: string | undefined,
): string | undefined {
  if (!caption?.trim()) return undefined;
  const normalized = caption.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(.+?)\s+video game collectible\b/i);
  return match?.[1]?.trim() || undefined;
}

function parseSitemapImages(
  block: string,
): Array<{ url: string; label?: string }> {
  const images: Array<{ url: string; label?: string }> = [];
  const seen = new Set<string>();

  for (const imageMatch of block.matchAll(
    /<image:image>([\s\S]*?)<\/image:image>/gi,
  )) {
    const imageBlock = imageMatch[1];
    const url = imageBlock
      .match(/<image:loc>([^<]+)<\/image:loc>/i)?.[1]
      ?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const caption = imageBlock
      .match(/<image:caption>([^<]*)<\/image:caption>/i)?.[1]
      ?.trim();
    const label =
      caption?.replace(/\s*-\s*Main Image\s+\d+\s*$/i, "").trim() ||
      undefined;
    images.push({ url, ...(label ? { label } : {}) });
  }

  return images;
}

export function extractSitemapCatalogBlocks(xml: string): ICollectSitemapBlock[] {
  const blocks: ICollectSitemapBlock[] = [];

  for (const urlMatch of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = urlMatch[1];
    const locMatch = block.match(
      /<loc>(https:\/\/www\.icollecteverything\.com\/db\/item\/videogame\/(\d+)\/)<\/loc>/i,
    );
    if (!locMatch) continue;

    const itemUrl = locMatch[1];
    const itemId = locMatch[2];
    const images = parseSitemapImages(block);
    const title =
      parseTitleFromSitemapCaption(
        block.match(/<image:caption>([^<]+)<\/image:caption>/i)?.[1],
      ) || undefined;

    const barcodes: ICollectSitemapBlock["barcodes"] = [];
    const seenKeys = new Set<string>();
    for (const barcodeMatch of block.matchAll(/\[Barcode\s+([0-9]+)\]/gi)) {
      const rawBarcode = barcodeMatch[1];
      const barcodeKey = barcodeMatchKey(rawBarcode);
      if (!barcodeKey || seenKeys.has(barcodeKey)) continue;
      seenKeys.add(barcodeKey);
      barcodes.push({ barcodeKey, rawBarcode });
    }

    if (barcodes.length === 0) continue;

    blocks.push({
      itemId,
      itemUrl,
      title,
      coverUrl: images[0]?.url,
      images,
      barcodes,
    });
  }

  return blocks;
}

export function extractBarcodeEntriesFromSitemapXml(
  xml: string,
): ICollectBarcodeIndexEntry[] {
  return extractSitemapCatalogBlocks(xml).flatMap((block) =>
    block.barcodes.map((barcode) => ({
      barcodeKey: barcode.barcodeKey,
      rawBarcode: barcode.rawBarcode,
      itemId: block.itemId,
      itemUrl: block.itemUrl,
    })),
  );
}

export function sitemapBlockToMetadata(
  block: ICollectSitemapBlock,
): ICollectMetadata | null {
  if (!block.title) return null;

  return {
    itemId: block.itemId,
    itemUrl: block.itemUrl,
    title: block.title,
    barcode: block.barcodes[0]?.rawBarcode ?? null,
    coverUrl: block.coverUrl ?? null,
    images: block.images,
    catalogSource: "sitemap",
  };
}

function configureIndexDatabase(db: DatabaseSync): void {
  db.exec("PRAGMA busy_timeout = 5000");
}

function openDatabase(filePath: string): DatabaseSync {
  const db = new DatabaseSync(filePath);
  configureIndexDatabase(db);
  if (!isIndexSchemaCurrent(db)) {
    migrateIndexSchema(db);
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
      configureIndexDatabase(db);
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

export function lookupICollectItemRefByBarcodeKey(
  db: DatabaseSync,
  barcodeKey: string,
): { itemId: string; itemUrl: string } | null {
  if (!barcodeKey) return null;
  const row = db
    .prepare(
      "SELECT item_id, item_url FROM barcode_index WHERE barcode_key = ?",
    )
    .get(barcodeKey) as { item_id?: string; item_url?: string } | undefined;
  if (!row?.item_id || !row.item_url) return null;
  return { itemId: row.item_id, itemUrl: row.item_url };
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

function readIndexedCatalogSource(payload: string): string | undefined {
  try {
    const parsed = JSON.parse(payload) as { catalogSource?: string };
    return parsed.catalogSource;
  } catch {
    return undefined;
  }
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

  const catalogSource = readIndexedCatalogSource(row.payload);
  if (catalogSource === "sitemap" || catalogSource === "page") {
    return row.payload;
  }

  if (Date.now() - row.fetched_at > maxAgeMs) return null;
  return row.payload;
}

export function readICollectItemCatalogRow(
  db: DatabaseSync,
  itemId: string,
): { metadata: ICollectMetadata; fetchedAt: number } | null {
  const row = db
    .prepare("SELECT payload, fetched_at FROM item_metadata WHERE item_id = ?")
    .get(itemId) as { payload?: string; fetched_at?: number } | undefined;
  if (!row?.payload || typeof row.fetched_at !== "number") return null;
  try {
    const metadata = JSON.parse(row.payload) as ICollectMetadata;
    if (!metadata.title?.trim()) return null;
    return { metadata, fetchedAt: row.fetched_at };
  } catch {
    return null;
  }
}

export function isICollectItemPageCatalogStale(
  db: DatabaseSync,
  itemId: string,
  maxAgeMs = DEFAULT_PAGE_CATALOG_REFRESH_MS,
): boolean {
  const row = readICollectItemCatalogRow(db, itemId);
  if (!row) return true;
  if (row.metadata.catalogSource !== "page") return true;
  return Date.now() - row.fetchedAt >= maxAgeMs;
}

export function shouldRefreshICollectItemPage(
  db: DatabaseSync,
  itemId: string,
  options: { force?: boolean; maxAgeMs?: number } = {},
): boolean {
  if (options.force) return true;
  if (!isICollectItemPageCatalog(db, itemId)) return true;
  return isICollectItemPageCatalogStale(
    db,
    itemId,
    options.maxAgeMs ?? DEFAULT_PAGE_CATALOG_REFRESH_MS,
  );
}

export function rememberICollectItemCatalog(
  db: DatabaseSync,
  metadata: ICollectMetadata,
): boolean {
  if (!metadata.itemId || !metadata.title?.trim()) return false;

  const existingRow = readICollectItemCatalogRow(db, metadata.itemId);
  if (existingRow) {
    const existingSource = existingRow.metadata.catalogSource;
    if (existingSource === "page" && metadata.catalogSource === "sitemap") {
      return false;
    }

    const merged =
      metadata.catalogSource === "page" || existingSource === "page"
        ? mergeICollectCatalogMetadata(existingRow.metadata, {
            ...metadata,
            catalogSource: "page",
          })
        : mergeICollectCatalogMetadata(existingRow.metadata, metadata);

    writeCachedICollectMetadata(db, metadata.itemId, JSON.stringify(merged));
    return true;
  }

  writeCachedICollectMetadata(db, metadata.itemId, JSON.stringify(metadata));
  return true;
}

export function writeCachedICollectMetadata(
  db: DatabaseSync,
  itemId: string,
  payload: string,
): void {
  db.prepare(
    `
    INSERT INTO item_metadata (item_id, payload, fetched_at)
    VALUES (?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      payload = excluded.payload,
      fetched_at = excluded.fetched_at
  `,
  ).run(itemId, payload, Date.now());
}

export function countICollectBarcodeIndex(db: DatabaseSync): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM barcode_index")
    .get() as { count?: number } | undefined;
  return Number(row?.count || 0);
}

export function countICollectItemCatalog(db: DatabaseSync): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM item_metadata")
    .get() as { count?: number } | undefined;
  return Number(row?.count || 0);
}

export function countICollectPageCatalog(db: DatabaseSync): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS count FROM item_metadata WHERE payload LIKE '%\"catalogSource\":\"page\"%'",
    )
    .get() as { count?: number } | undefined;
  return Number(row?.count || 0);
}

export function readICollectIndexMeta(
  db: DatabaseSync,
  key: string,
): string | null {
  const row = db
    .prepare("SELECT value FROM index_meta WHERE key = ?")
    .get(key) as { value?: string } | undefined;
  return row?.value ?? null;
}

export function writeICollectIndexMeta(
  db: DatabaseSync,
  key: string,
  value: string,
): void {
  db.prepare(
    "INSERT INTO index_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function isICollectItemPageCatalog(
  db: DatabaseSync,
  itemId: string,
): boolean {
  const payload = readCachedICollectMetadata(db, itemId);
  return payload?.includes('"catalogSource":"page"') ?? false;
}

export type ICollectItemRef = { itemId: string; itemUrl: string };

export function listDistinctICollectItems(db: DatabaseSync): ICollectItemRef[] {
  const rows = db
    .prepare(
      `
      SELECT DISTINCT item_id AS itemId, item_url AS itemUrl
      FROM barcode_index
      ORDER BY item_id
    `,
    )
    .all() as ICollectItemRef[];
  return rows.filter((row) => row.itemId && row.itemUrl);
}

export async function ingestICollectSitemapXml(
  db: DatabaseSync,
  xml: string,
): Promise<ICollectIngestStats> {
  const blocks = extractSitemapCatalogBlocks(xml);
  let barcodeUpserts = 0;
  let catalogUpserts = 0;

  for (const block of blocks) {
    barcodeUpserts += rememberICollectBarcodeMappings(
      db,
      block.barcodes.map((barcode) => ({
        barcodeKey: barcode.barcodeKey,
        rawBarcode: barcode.rawBarcode,
        itemId: block.itemId,
        itemUrl: block.itemUrl,
      })),
    );

    const metadata = sitemapBlockToMetadata(block);
    if (metadata && rememberICollectItemCatalog(db, metadata)) {
      catalogUpserts += 1;
    }
  }

  return { barcodeUpserts, catalogUpserts };
}

export function resetICollectIndexForTests(): void {
  activeDb?.close();
  activeDb = null;
  indexInitPromise = null;
}
