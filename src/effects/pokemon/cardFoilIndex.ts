/**
 * SQLite implementation of the per-print foil texture lookups.
 *
 * Table `card_foil` in `data/pokemon/catalog.sqlite`, built by
 * `Catalogue Sync Pokémon`.
 *
 * Do not import this from client modules — importing it is what *installs* the
 * real lookups, and `node:sqlite` has no browser build. Client packs import
 * {@link ./cardFoilLookups} instead and get stubs. Avoid `server-only`:
 * background workers run through tsx, outside Next's react-server resolution,
 * exactly as `liveCardsIndex` documents.
 */
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import "@/lib/foilMetaLoad.server";
import { dataRoot } from "@/lib/runtimeData";

import {
  installCardFoilLookups,
  type CardFoilVariant,
} from "./cardFoilLookups";

export type { CardFoilVariant } from "./cardFoilLookups";

const SELECT_COLS = `
  bundle_id AS bundleId,
  variant,
  card_tex AS cardTex,
  mask_tex AS maskTex,
  etch_tex AS etchTex,
  cold_foil_tex AS coldFoilTex,
  foil,
  shader
`;

let cachedPath: string | null = null;
let cachedMtimeMs: number | null = null;
let cachedDb: DatabaseSync | null = null;

export function cardFoilDbPath(): string {
  const override = process.env.PLACARR_LIVE_CARDS_DB?.trim();
  if (override) return path.resolve(override);
  return path.join(dataRoot(), "pokemon", "catalog.sqlite");
}

function openDb(dbPath = cardFoilDbPath()): DatabaseSync | null {
  if (!existsSync(dbPath)) {
    resetCardFoilIndexCache();
    return null;
  }
  const mtimeMs = statSync(dbPath).mtimeMs;
  if (cachedDb && cachedPath === dbPath && cachedMtimeMs === mtimeMs) {
    return cachedDb;
  }
  try {
    cachedDb?.close();
  } catch {
    /* ignore */
  }
  const db = new DatabaseSync(dbPath, { readOnly: true });
  cachedDb = db;
  cachedPath = dbPath;
  cachedMtimeMs = mtimeMs;
  return db;
}

/** Test helper — drop cached connection. */
export function resetCardFoilIndexCache(): void {
  try {
    cachedDb?.close();
  } catch {
    /* ignore */
  }
  cachedDb = null;
  cachedPath = null;
  cachedMtimeMs = null;
}

function hasTable(db: DatabaseSync): boolean {
  const row = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='card_foil'`,
    )
    .get() as Record<string, unknown> | undefined;
  return Boolean(row?.name);
}

function mapRow(row: Record<string, unknown>): CardFoilVariant | null {
  const variant = String(row.variant ?? "");
  if (variant !== "std" && variant !== "ph") return null;
  return {
    variant,
    cardTex: String(row.cardTex ?? ""),
    maskTex: String(row.maskTex ?? ""),
    etchTex: String(row.etchTex ?? ""),
    coldFoilTex: String(row.coldFoilTex ?? ""),
    foil: String(row.foil ?? ""),
    shader: String(row.shader ?? ""),
  };
}

function variantsForBundle(bundleId: string): CardFoilVariant[] {
  const db = openDb();
  if (!db || !hasTable(db)) return [];
  const id = bundleId.trim();
  if (!id) return [];
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLS} FROM card_foil
       WHERE bundle_id = ?
       ORDER BY CASE variant WHEN 'ph' THEN 0 ELSE 1 END`,
    )
    .all(id) as Record<string, unknown>[];
  return rows.map(mapRow).filter((v): v is CardFoilVariant => v !== null);
}

function bundlesForShader(
  shader: string,
  opts?: { limit?: number },
): { bundleId: string; variant: CardFoilVariant }[] {
  const db = openDb();
  if (!db || !hasTable(db)) return [];
  const wanted = shader.trim();
  if (!wanted) return [];
  /*
    French prints first, then everything else — the playroom captions in FR and
    a German face with a French label reads as a bug. `ph` before `std` within a
    bundle keeps the reverse-holo face preferred, as the JSON scan did.
  */
  const limit = Math.max(1, opts?.limit ?? 512);
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLS} FROM card_foil
       WHERE shader = ?
       ORDER BY
         CASE WHEN bundle_id LIKE '%\\_fr\\_%' ESCAPE '\\' THEN 0 ELSE 1 END,
         CASE variant WHEN 'ph' THEN 0 ELSE 1 END,
         bundle_id
       LIMIT ?`,
    )
    .all(wanted, limit) as Record<string, unknown>[];

  const out: { bundleId: string; variant: CardFoilVariant }[] = [];
  for (const row of rows) {
    const variant = mapRow(row);
    if (!variant) continue;
    out.push({ bundleId: String(row.bundleId ?? ""), variant });
  }
  return out;
}

function listBundleIds(): string[] {
  const db = openDb();
  if (!db || !hasTable(db)) return [];
  const rows = db
    .prepare(`SELECT DISTINCT bundle_id AS id FROM card_foil ORDER BY id`)
    .all() as Record<string, unknown>[];
  return rows.map((row) => String(row.id ?? "")).filter(Boolean);
}

function listSetIds(): string[] {
  const db = openDb();
  if (!db || !hasTable(db)) return [];
  /*
    The set stem is everything before the first underscore (`bw10_de_001` →
    `bw10`). Done in SQL so 41 546 ids never cross into JS just to be split.
  */
  const rows = db
    .prepare(
      `SELECT DISTINCT substr(bundle_id, 1, instr(bundle_id, '_') - 1) AS setId
       FROM card_foil
       WHERE instr(bundle_id, '_') > 1
       ORDER BY setId`,
    )
    .all() as Record<string, unknown>[];
  return rows.map((row) => String(row.setId ?? "")).filter(Boolean);
}

function cardFoilIndexAvailable(dbPath?: string): boolean {
  const db = openDb(dbPath);
  return Boolean(db && hasTable(db));
}

installCardFoilLookups({
  variantsForBundle,
  bundlesForShader,
  listBundleIds,
  listSetIds,
  cardFoilIndexAvailable,
});

export {
  variantsForBundle,
  bundlesForShader,
  listBundleIds,
  listSetIds,
  cardFoilIndexAvailable,
};
