/**
 * Legacy printKey → canonical after art-letter / print_sets dedupe.
 * Sourced from pack_documents or curated ledger written by dedupePrintSets.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { packCatalogDb } from "@/lib/packPaths";

import { DBS_JCC_PACK_ID, dbsJccCuratedDir } from "./pack";

let cache: Map<string, string> | null = null;

function loadFromSqlite(packId: string): Map<string, string> | null {
  const dbPath = packCatalogDb(packId);
  if (!existsSync(dbPath)) return null;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = db
        .prepare(
          `SELECT payload_json AS json FROM pack_documents WHERE doc_key = 'print_key_aliases'`,
        )
        .get() as { json?: string } | undefined;
      if (!row?.json) return null;
      const payload = JSON.parse(row.json) as {
        aliases?: Record<string, string>;
      };
      return new Map(
        Object.entries(payload.aliases ?? {}).map(([from, to]) => [
          from.toLowerCase(),
          to.toLowerCase(),
        ]),
      );
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

function loadFromCurated(): Map<string, string> | null {
  const file = path.join(
    dbsJccCuratedDir(),
    "sources",
    "print-key-aliases.json",
  );
  if (!existsSync(file)) return null;
  try {
    const payload = JSON.parse(readFileSync(file, "utf8")) as {
      aliases?: Record<string, string>;
    };
    return new Map(
      Object.entries(payload.aliases ?? {}).map(([from, to]) => [
        from.toLowerCase(),
        to.toLowerCase(),
      ]),
    );
  } catch {
    return null;
  }
}

export function resetDbsjccPrintKeyAliasCache(): void {
  cache = null;
}

export function resolveDbsjccPrintKeyAlias(
  printKey: string,
  packId: string = DBS_JCC_PACK_ID,
): string {
  const key = printKey.trim().toLowerCase();
  if (!key) return key;
  if (!cache) {
    cache = loadFromSqlite(packId) ?? loadFromCurated() ?? new Map();
  }
  return cache.get(key) ?? key;
}
