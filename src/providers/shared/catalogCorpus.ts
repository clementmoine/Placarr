/**
 * Shared helpers for ProviderModule.catalog — last-run / empty pack signals.
 * Providers own their refresh; this only standardizes status shape.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  ProviderCatalogLastGrowth,
  ProviderCatalogStatus,
} from "@/types/providerModule";
import { packLogsDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";

const DEFAULT_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

export type CatalogLastRunFile = {
  finishedAt?: string;
  at?: string;
  auto?: boolean;
  only?: readonly string[] | null;
  skip?: readonly string[] | null;
  langs?: readonly string[] | null;
  limit?: number | null;
  cards?: number;
  products?: number;
  sets?: number;
  cardsDelta?: number;
  productsDelta?: number;
  setsDelta?: number;
  addedSets?: string[];
};

/** Point-in-time corpus counts from catalog.sqlite (or equivalent). */
export type CatalogCorpusSnapshot = {
  cards: number;
  products: number;
  sets: number;
  setIds: string[];
};

const ADDED_SETS_CAP = 24;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function deltaOrUndef(
  after: number | undefined,
  before: number | undefined,
): number | undefined {
  if (after == null || before == null) return undefined;
  return after - before;
}

function sqliteTableExists(db: DatabaseSync, table: string): boolean {
  try {
    const row = db
      .prepare(
        `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`,
      )
      .get(table) as { ok: number } | undefined;
    return Boolean(row);
  } catch {
    return false;
  }
}

function sqliteCount(db: DatabaseSync, table: string): number {
  try {
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
      .get() as { n: number } | undefined;
    return Number(row?.n) || 0;
  } catch {
    return 0;
  }
}

/**
 * Best-effort corpus measure on a pack sqlite (LocalPrints / Bandai / Lorcana…).
 * Missing file → zeros. Unknown schema → zeros (pipeline counts still apply).
 */
export function measureCatalogDbCorpus(dbPath: string): CatalogCorpusSnapshot {
  const empty: CatalogCorpusSnapshot = {
    cards: 0,
    products: 0,
    sets: 0,
    setIds: [],
  };
  if (!dbPath || !existsSync(dbPath)) return empty;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const cards = sqliteTableExists(db, "prints")
        ? sqliteCount(db, "prints")
        : 0;
      const products = sqliteTableExists(db, "products")
        ? sqliteCount(db, "products")
        : 0;
      const setIds = new Set<string>();
      if (sqliteTableExists(db, "prints")) {
        try {
          const rows = db
            .prepare(
              `SELECT DISTINCT set_code AS setCode FROM prints
                WHERE set_code IS NOT NULL AND TRIM(set_code) <> ''`,
            )
            .all() as { setCode: string }[];
          for (const row of rows) {
            const id = row.setCode.trim().toLowerCase();
            if (id && id !== "unknown") setIds.add(id);
          }
        } catch {
          /* no set_code column */
        }
      }
      if (sqliteTableExists(db, "print_sets")) {
        try {
          const rows = db
            .prepare(
              `SELECT DISTINCT set_code AS setCode FROM print_sets
                WHERE set_code IS NOT NULL AND TRIM(set_code) <> ''`,
            )
            .all() as { setCode: string }[];
          for (const row of rows) {
            const id = row.setCode.trim().toLowerCase();
            if (id && id !== "unknown") setIds.add(id);
          }
        } catch {
          /* ignore */
        }
      }
      const ids = [...setIds].sort();
      return { cards, products, sets: ids.length, setIds: ids };
    } finally {
      db.close();
    }
  } catch {
    return empty;
  }
}

/** Prefer a positive disk measure; fall back to pipeline when the DB is empty. */
function pickTotal(
  after: number | undefined,
  pipeline: number | undefined,
): number | undefined {
  const measured = finiteNumber(after);
  const reported = finiteNumber(pipeline);
  if (measured != null && measured > 0) return measured;
  if (reported != null && reported > 0) return reported;
  return measured ?? reported;
}

/** Merge pipeline counts + corpus measure into last-run growth (+ deltas). */
export function buildCatalogLastGrowth(input: {
  pipeline?: { cards?: number; products?: number; sets?: number };
  after?: Partial<CatalogCorpusSnapshot> | null;
  before?: Partial<CatalogCorpusSnapshot> | null;
}): ProviderCatalogLastGrowth | null {
  const measuredCards = finiteNumber(input.after?.cards);
  const measuredProducts = finiteNumber(input.after?.products);
  const measuredSets = finiteNumber(input.after?.sets);

  const cards = pickTotal(measuredCards, input.pipeline?.cards);
  const products = pickTotal(measuredProducts, input.pipeline?.products);
  const sets = pickTotal(measuredSets, input.pipeline?.sets);

  const beforeCards = finiteNumber(input.before?.cards);
  const beforeProducts = finiteNumber(input.before?.products);
  const beforeSets = finiteNumber(input.before?.sets);

  const afterIds = new Set(
    (input.after?.setIds ?? [])
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );
  const beforeIds = new Set(
    (input.before?.setIds ?? [])
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );
  const addedSets = [...afterIds]
    .filter((id) => !beforeIds.has(id))
    .sort()
    .slice(0, ADDED_SETS_CAP);

  // Deltas from disk when measured; else total vs before (pipeline-only packs).
  const cardsDelta = deltaOrUndef(
    measuredCards != null && measuredCards > 0 ? measuredCards : cards,
    beforeCards,
  );
  const productsDelta = deltaOrUndef(
    measuredProducts != null && measuredProducts > 0
      ? measuredProducts
      : products,
    beforeProducts,
  );
  const setsDelta =
    deltaOrUndef(
      measuredSets != null && measuredSets > 0 ? measuredSets : sets,
      beforeSets,
    ) ?? (addedSets.length > 0 ? addedSets.length : undefined);

  const out: ProviderCatalogLastGrowth = {
    ...(cards != null && cards > 0 ? { cards } : {}),
    ...(products != null && products > 0 ? { products } : {}),
    ...(sets != null && sets > 0 ? { sets } : {}),
    ...(cardsDelta != null && cardsDelta !== 0 ? { cardsDelta } : {}),
    ...(productsDelta != null && productsDelta !== 0
      ? { productsDelta }
      : {}),
    ...(setsDelta != null && setsDelta !== 0 ? { setsDelta } : {}),
    ...(addedSets.length ? { addedSets } : {}),
  };
  return Object.keys(out).length ? out : null;
}

export function catalogMaxAgeMs(): number {
  const raw = Number(process.env.PLACARR_CATALOG_SYNC_MAX_AGE_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  const foil = Number(process.env.PLACARR_FOIL_SYNC_MAX_AGE_MS);
  return Number.isFinite(foil) && foil > 0 ? foil : DEFAULT_MAX_AGE_MS;
}

function readLastRunFile(dataPack: string): CatalogLastRunFile | null {
  const p = path.join(packLogsDir(dataPack), "last-run.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as CatalogLastRunFile;
  } catch {
    return null;
  }
}

export function lastRunGrowthForPack(
  dataPack: string,
): ProviderCatalogLastGrowth | null {
  const parsed = readLastRunFile(dataPack);
  if (!parsed) return null;
  const out: ProviderCatalogLastGrowth = {};
  if (finiteNumber(parsed.cards) != null) out.cards = parsed.cards;
  if (finiteNumber(parsed.products) != null) out.products = parsed.products;
  if (finiteNumber(parsed.sets) != null) out.sets = parsed.sets;
  if (finiteNumber(parsed.cardsDelta) != null) {
    out.cardsDelta = parsed.cardsDelta;
  }
  if (finiteNumber(parsed.productsDelta) != null) {
    out.productsDelta = parsed.productsDelta;
  }
  if (finiteNumber(parsed.setsDelta) != null) out.setsDelta = parsed.setsDelta;
  if (Array.isArray(parsed.addedSets) && parsed.addedSets.length) {
    out.addedSets = parsed.addedSets.filter(
      (id): id is string => typeof id === "string" && id.trim() !== "",
    );
  }
  return Object.keys(out).length ? out : null;
}

export function lastRunAtForPack(dataPack: string): string | null {
  const p = path.join(packLogsDir(dataPack), "last-run.json");
  if (!existsSync(p)) return null;
  try {
    const parsed = readLastRunFile(dataPack);
    if (typeof parsed?.finishedAt === "string") return parsed.finishedAt;
    if (typeof parsed?.at === "string") return parsed.at;
    return new Date(statSync(p).mtimeMs).toISOString();
  } catch {
    try {
      return new Date(statSync(p).mtimeMs).toISOString();
    } catch {
      return null;
    }
  }
}

export function lastRunMtimeMs(dataPack: string): number | null {
  const iso = lastRunAtForPack(dataPack);
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function statusFromLastRun(opts: {
  dataPack: string;
  empty: boolean;
  maxAgeMs?: number;
}): ProviderCatalogStatus {
  const lastGrowth = lastRunGrowthForPack(opts.dataPack);
  const lastSyncAt = lastRunAtForPack(opts.dataPack);
  if (opts.empty) {
    return {
      empty: true,
      stale: true,
      lastSyncAt,
      lastGrowth,
    };
  }
  const mtime = lastRunMtimeMs(opts.dataPack);
  if (mtime == null) {
    return { empty: false, stale: true, lastSyncAt: null, lastGrowth };
  }
  const maxAge = opts.maxAgeMs ?? catalogMaxAgeMs();
  return {
    empty: false,
    stale: Date.now() - mtime > maxAge,
    lastSyncAt,
    lastGrowth,
  };
}

export function dataPackPath(dataPack: string, ...parts: string[]): string {
  return path.join(dataRoot(), dataPack, ...parts);
}

export function pathExists(...parts: string[]): boolean {
  return existsSync(path.join(...parts));
}
