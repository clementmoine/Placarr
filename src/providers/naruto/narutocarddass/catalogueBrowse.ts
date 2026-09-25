/**
 * Admin Catalogue browse for Naruto Carddass — sqlite SSOT (`catalog.sqlite`).
 *
 * Reuses `buildCatalogueCardRows` (same-number donor, collector-disk URLs,
 * jp-only filter) so behavior stays identical to the former cards-index path.
 */
import { existsSync, statSync } from "node:fs";

import {
  buildCatalogueCardRows,
  type CatalogueCardRow,
} from "@/lib/admin/catalogueCards";

import { NARUTO_PACK_ID } from "./identity";
import {
  loadNarutoCardsIndexFromSqlite,
  narutoPackDbPath,
} from "./indexStore";

type Cache = { mtimeMs: number; rows: CatalogueCardRow[] };
let cache: Cache | null = null;

function sqliteMtimeMs(): number {
  try {
    const file = narutoPackDbPath(NARUTO_PACK_ID);
    if (!existsSync(file)) return 0;
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

export { loadNarutoCardsIndexFromSqlite };

export function buildCarddassCatalogueBrowseRows(): CatalogueCardRow[] | null {
  const mtimeMs = sqliteMtimeMs();
  if (cache && cache.mtimeMs === mtimeMs) return cache.rows;

  const index = loadNarutoCardsIndexFromSqlite(NARUTO_PACK_ID);
  if (!index || Object.keys(index.cards).length === 0) return null;

  const rows = buildCatalogueCardRows(NARUTO_PACK_ID, index);
  cache = { mtimeMs, rows };
  return rows;
}

export function clearCarddassCatalogueBrowseCache(): void {
  cache = null;
}
