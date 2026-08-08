/**
 * Local SQLite index of TCG Live card-database identity rows.
 * Built by ``pnpm foil:pokemon:index-cards`` → ``data/pokemon/live-cards.sqlite``.
 *
 * Join aid only — TCGdex remains the product catalogue.
 *
 * Do not import this from client modules. Client packs use
 * {@link ./liveCardsLookups} stubs; this file installs the real impl when
 * loaded on the server (provider / worker / scripts). Avoid `server-only` —
 * background workers run via tsx outside Next's react-server resolution.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { dataRoot } from "@/lib/runtimeData";

import {
  installLiveCardsLookups,
  type LiveCardRow,
} from "./liveCardsLookups";

export type { LiveCardRow } from "./liveCardsLookups";

const SELECT_COLS = `
  bundle_stem AS bundleStem,
  live_set AS liveSet,
  num,
  lang,
  variant,
  long_form_id AS longFormId,
  card_id AS cardId,
  name_en AS nameEn,
  name_fr AS nameFr,
  collector_num AS collectorNum,
  foil_effect AS foilEffect,
  foil_mask AS foilMask,
  rarity_code AS rarityCode,
  set_code AS setCode
`;

let cachedPath: string | null = null;
let cachedDb: DatabaseSync | null = null;

export function liveCardsDbPath(): string {
  const override = process.env.PLACARR_LIVE_CARDS_DB?.trim();
  if (override) return path.resolve(override);
  return path.join(dataRoot(), "pokemon", "live-cards.sqlite");
}

function openDb(dbPath = liveCardsDbPath()): DatabaseSync | null {
  if (cachedDb && cachedPath === dbPath) return cachedDb;
  if (!existsSync(dbPath)) {
    cachedDb = null;
    cachedPath = dbPath;
    return null;
  }
  const db = new DatabaseSync(dbPath, { readOnly: true });
  cachedDb = db;
  cachedPath = dbPath;
  return db;
}

/** Test helper — drop cached connection. */
export function resetLiveCardsIndexCache(): void {
  try {
    cachedDb?.close();
  } catch {
    /* ignore */
  }
  cachedDb = null;
  cachedPath = null;
}

function mapRow(row: Record<string, unknown> | undefined): LiveCardRow | null {
  if (!row || typeof row.bundleStem !== "string") return null;
  return {
    bundleStem: row.bundleStem,
    liveSet: String(row.liveSet ?? ""),
    num: Number(row.num ?? 0),
    lang: String(row.lang ?? ""),
    variant: String(row.variant ?? ""),
    longFormId: String(row.longFormId ?? ""),
    cardId: row.cardId == null ? null : String(row.cardId),
    nameEn: row.nameEn == null ? null : String(row.nameEn),
    nameFr: row.nameFr == null ? null : String(row.nameFr),
    collectorNum: row.collectorNum == null ? null : String(row.collectorNum),
    foilEffect: row.foilEffect == null ? null : String(row.foilEffect),
    foilMask: row.foilMask == null ? null : String(row.foilMask),
    rarityCode: row.rarityCode == null ? null : String(row.rarityCode),
    setCode: row.setCode == null ? null : String(row.setCode),
  };
}

export function lookupByBundle(
  bundleStem: string,
  opts?: { variant?: string; dbPath?: string },
): LiveCardRow | null {
  const db = openDb(opts?.dbPath);
  if (!db) return null;
  const stem = bundleStem.trim().toLowerCase();
  if (!stem) return null;
  if (opts?.variant) {
    const row = db
      .prepare(
        `SELECT ${SELECT_COLS} FROM live_cards
         WHERE bundle_stem = ? AND variant = ? LIMIT 1`,
      )
      .get(stem, opts.variant.trim().toLowerCase()) as
      | Record<string, unknown>
      | undefined;
    return mapRow(row);
  }
  // Prefer std, then any variant for the bundle.
  const row = db
    .prepare(
      `SELECT ${SELECT_COLS} FROM live_cards
       WHERE bundle_stem = ?
       ORDER BY CASE variant WHEN 'std' THEN 0 WHEN 'ph' THEN 1 ELSE 2 END
       LIMIT 1`,
    )
    .get(stem) as Record<string, unknown> | undefined;
  return mapRow(row);
}

export function lookupBySetNum(
  liveSet: string,
  num: number | string,
  opts?: { lang?: string; variant?: string; dbPath?: string },
): LiveCardRow | null {
  const db = openDb(opts?.dbPath);
  if (!db) return null;
  const set = liveSet.trim().toLowerCase();
  const n =
    typeof num === "number" ? num : Number.parseInt(String(num).replace(/\D/g, ""), 10);
  if (!set || !Number.isFinite(n)) return null;
  const lang = (opts?.lang ?? "fr").trim().toLowerCase() || "fr";
  const variant = opts?.variant?.trim().toLowerCase();
  if (variant) {
    const row = db
      .prepare(
        `SELECT ${SELECT_COLS} FROM live_cards
         WHERE live_set = ? AND num = ? AND lang = ? AND variant = ?
         LIMIT 1`,
      )
      .get(set, n, lang, variant) as Record<string, unknown> | undefined;
    return mapRow(row);
  }
  const row = db
    .prepare(
      `SELECT ${SELECT_COLS} FROM live_cards
       WHERE live_set = ? AND num = ? AND lang = ?
       ORDER BY CASE variant WHEN 'std' THEN 0 WHEN 'ph' THEN 1 ELSE 2 END
       LIMIT 1`,
    )
    .get(set, n, lang) as Record<string, unknown> | undefined;
  return mapRow(row);
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Find a Live row by catalogue name within candidate Live set stems.
 * Prefers exact EN/FR match, then normalized equality.
 */
export function lookupByName(
  liveSets: readonly string[],
  cardName: string,
  opts?: { lang?: string; dbPath?: string },
): LiveCardRow | null {
  const db = openDb(opts?.dbPath);
  if (!db) return null;
  const name = cardName.trim();
  if (!name || liveSets.length === 0) return null;
  const lang = (opts?.lang ?? "fr").trim().toLowerCase() || "fr";
  const sets = [...new Set(liveSets.map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (sets.length === 0) return null;

  const placeholders = sets.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLS} FROM live_cards
       WHERE live_set IN (${placeholders}) AND lang = ?
         AND variant IN ('std', 'ph')
       ORDER BY CASE variant WHEN 'std' THEN 0 ELSE 1 END`,
    )
    .all(...sets, lang) as Record<string, unknown>[];

  const want = normalizeName(name);
  let normalizedHit: LiveCardRow | null = null;
  for (const raw of rows) {
    const row = mapRow(raw);
    if (!row) continue;
    const en = row.nameEn?.trim() ?? "";
    const fr = row.nameFr?.trim() ?? "";
    if (en === name || fr === name) return row;
    if (
      !normalizedHit &&
      (normalizeName(en) === want || normalizeName(fr) === want)
    ) {
      normalizedHit = row;
    }
  }
  return normalizedHit;
}

export function liveCardsIndexAvailable(dbPath?: string): boolean {
  return openDb(dbPath) != null;
}

installLiveCardsLookups({
  lookupByBundle,
  lookupBySetNum,
  lookupByName,
  liveCardsIndexAvailable,
});
