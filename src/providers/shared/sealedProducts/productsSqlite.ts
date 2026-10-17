/**
 * Sealed products + contents tables inside pack `catalog.sqlite`.
 *
 * Identity prints and sealed SKUs share one DB so product→print joins are
 * local. `products-index.json` may still be written as a projection during
 * transition; runtime prefers sqlite when the tables are present.
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { packCatalogDb } from "@/lib/packPaths";

import {
  isProductsIndexV1,
  type ProductsIndexV1,
  type SealedProductEntry,
} from "./indexFormat";

export function migrateProductsSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      product_key TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      lang TEXT,
      set_code TEXT,
      kind TEXT,
      name TEXT,
      image TEXT,
      price_cents INTEGER,
      entry_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
    CREATE INDEX IF NOT EXISTS idx_products_set ON products(set_code);

    CREATE TABLE IF NOT EXISTS product_contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_key TEXT NOT NULL,
      print_key TEXT,
      name TEXT,
      slug TEXT,
      ref TEXT,
      qty INTEGER,
      finish TEXT,
      image TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_product_contents_product
      ON product_contents(product_key);
    CREATE INDEX IF NOT EXISTS idx_product_contents_print
      ON product_contents(print_key);

    CREATE TABLE IF NOT EXISTS locale_specific_faces (
      set_code TEXT NOT NULL,
      card TEXT NOT NULL,
      PRIMARY KEY (set_code, card)
    );

    CREATE TABLE IF NOT EXISTS pack_documents (
      doc_key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function writeProductsIndexToSqlite(
  packId: string,
  index: ProductsIndexV1,
  opts?: { dbPath?: string },
): { dbPath: string; products: number; contents: number } {
  const dbPath = opts?.dbPath ?? packCatalogDb(packId);
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    migrateProductsSchema(db);
    db.exec("BEGIN");
    db.exec(`DELETE FROM product_contents`);
    db.exec(`DELETE FROM products`);
    const insertProduct = db.prepare(`
      INSERT INTO products (
        product_key, slug, lang, set_code, kind, name, image, price_cents, entry_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertContent = db.prepare(`
      INSERT INTO product_contents (
        product_key, print_key, name, slug, ref, qty, finish, image
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let contents = 0;
    for (const [productKey, entry] of Object.entries(index.products)) {
      insertProduct.run(
        productKey,
        entry.slug,
        entry.lang,
        entry.setCode,
        entry.kind,
        entry.name,
        entry.image,
        entry.priceCents,
        JSON.stringify(entry),
      );
      for (const link of entry.prints ?? []) {
        insertContent.run(
          productKey,
          link.printKey,
          link.name,
          link.slug,
          link.ref,
          link.qty ?? null,
          link.finish ?? null,
          link.image ?? null,
        );
        contents += 1;
      }
    }
    db.exec("COMMIT");
    return { dbPath, products: Object.keys(index.products).length, contents };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    db.close();
  }
}

export function loadProductsIndexFromSqlite(
  packId: string,
  opts?: { dbPath?: string },
): ProductsIndexV1 | null {
  const dbPath = opts?.dbPath ?? packCatalogDb(packId);
  if (!existsSync(dbPath)) return null;
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return null;
  }
  try {
    const has = db
      .prepare(
        `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'products'`,
      )
      .get() as { ok?: number } | undefined;
    if (!has?.ok) return null;
    const rows = db
      .prepare(`SELECT product_key AS productKey, entry_json AS entryJson FROM products`)
      .all() as Array<{ productKey: string; entryJson: string }>;
    if (!rows.length) {
      return null;
    }
    const products: Record<string, SealedProductEntry> = {};
    for (const row of rows) {
      try {
        const entry = JSON.parse(row.entryJson) as SealedProductEntry;
        products[row.productKey] = entry;
      } catch {
        /* skip bad row */
      }
    }
    const index: ProductsIndexV1 = {
      version: 1,
      pack: packId,
      generatedAt: new Date().toISOString(),
      products,
    };
    return isProductsIndexV1(index) ? index : null;
  } finally {
    db.close();
  }
}

/** True when catalog.sqlite already holds at least one sealed SKU row. */
export function catalogHasProductsCorpus(packId: string): boolean {
  const dbPath = packCatalogDb(packId);
  if (!existsSync(dbPath)) return false;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = db
        .prepare(`SELECT COUNT(*) AS n FROM products`)
        .get() as { n: number } | undefined;
      return (row?.n ?? 0) > 0;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

export function writeLocaleSpecificFacesToSqlite(
  packId: string,
  faces: readonly { set: string; card: string }[],
  opts?: { dbPath?: string },
): { dbPath: string; faces: number } {
  const dbPath = opts?.dbPath ?? packCatalogDb(packId);
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    migrateProductsSchema(db);
    db.exec("BEGIN");
    db.exec(`DELETE FROM locale_specific_faces`);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO locale_specific_faces (set_code, card) VALUES (?, ?)`,
    );
    for (const row of faces) {
      insert.run(row.set.trim(), row.card.trim());
    }
    db.exec("COMMIT");
    return { dbPath, faces: faces.length };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    db.close();
  }
}

/** `null` when the table is missing or empty (treat all prints as language-neutral). */
export function loadLocaleSpecificFacesFromSqlite(
  packId: string,
  opts?: { dbPath?: string },
): Set<string> | null {
  const dbPath = opts?.dbPath ?? packCatalogDb(packId);
  if (!existsSync(dbPath)) return null;
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return null;
  }
  try {
    const has = db
      .prepare(
        `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'locale_specific_faces'`,
      )
      .get() as { ok?: number } | undefined;
    if (!has?.ok) return null;
    const rows = db
      .prepare(`SELECT set_code AS setCode, card FROM locale_specific_faces`)
      .all() as Array<{ setCode: string; card: string }>;
    if (!rows.length) return null;
    return new Set(
      rows.map((row) =>
        `${row.setCode.trim().toLowerCase()}\0${row.card.trim().padStart(4, "0")}`,
      ),
    );
  } finally {
    db.close();
  }
}

export function writePackDocument(
  packId: string,
  docKey: string,
  payload: unknown,
  opts?: { dbPath?: string },
): { dbPath: string } {
  const dbPath = opts?.dbPath ?? packCatalogDb(packId);
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    migrateProductsSchema(db);
    db.prepare(
      `INSERT INTO pack_documents (doc_key, payload_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(doc_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
    ).run(docKey, JSON.stringify(payload), new Date().toISOString());
    return { dbPath };
  } finally {
    db.close();
  }
}

export function readPackDocument<T = unknown>(
  packId: string,
  docKey: string,
  opts?: { dbPath?: string },
): T | null {
  const dbPath = opts?.dbPath ?? packCatalogDb(packId);
  if (!existsSync(dbPath)) return null;
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return null;
  }
  try {
    const row = db
      .prepare(
        `SELECT payload_json AS payloadJson FROM pack_documents WHERE doc_key = ?`,
      )
      .get(docKey) as { payloadJson: string } | undefined;
    if (!row?.payloadJson) return null;
    return JSON.parse(row.payloadJson) as T;
  } catch {
    return null;
  } finally {
    db.close();
  }
}
