/**
 * Lorcana official local SQLite index under `data/lorcana/catalog.sqlite`.
 * Built by scrape / `pnpm foil:lorcana:cards`. Blobs stay on disk; this stores
 * the full catalogue row from the same API call (titles, facts, remote URLs)
 * plus local asset filenames per printKey/lang.
 *
 * Server/worker only — do not import from client bundles.
 */
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { dataRoot } from "@/lib/runtimeData";
import { parsePrintKey } from "@/core/identify/printKey";
import type { CardsIndexEntry, CardsIndexV1 } from "@/effects/cardsIndex";

export const LORCANA_TCG_SCHEMA_VERSION = "2";

export type LorcanaTcgAssetFiles = {
  art?: string | null;
  thumb?: string | null;
  foilMask?: string | null;
  varnishMask?: string | null;
  secondVarnishMask?: string | null;
};

export type LorcanaTcgTitleRow = {
  printKey: string;
  lang: string;
  fullName: string;
  name?: string | null;
  version?: string | null;
  setName?: string | null;
  rarity?: string | null;
  cardType?: string | null;
  color?: string | null;
  story?: string | null;
  flavorText?: string | null;
  searchName?: string | null;
  /** Remote URLs from the catalogue call (not local paths). */
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  fullFoilUrl?: string | null;
  foilMaskUrl?: string | null;
  varnishMaskUrl?: string | null;
  secondVarnishMaskUrl?: string | null;
};

export type LorcanaTcgPrintRow = {
  printKey: string;
  setCode?: string | null;
  number?: string | null;
  variant?: string | null;
  promoGrouping?: string | null;
  providerId?: string | null;
  cost?: number | null;
  artists?: string[] | null;
  foilTypes?: string[] | null;
  varnishType?: string | null;
  cardmarketUrl?: string | null;
};

export type LorcanaTcgAssetRow = LorcanaTcgAssetFiles & {
  printKey: string;
  lang: string;
};

export type LorcanaCardsIndexJson = CardsIndexV1;

let activeDb: DatabaseSync | null = null;
let activePath: string | null = null;

export function lorcanaTcgDbPath(): string {
  const override = process.env.PLACARR_LORCANA_TCG_DB?.trim();
  if (override) return path.resolve(override);
  return path.join(dataRoot(), "lorcana", "catalog.sqlite");
}

function createSchema(db: DatabaseSync): void {
  db.exec(`
    DROP TABLE IF EXISTS meta;
    DROP TABLE IF EXISTS print_assets;
    DROP TABLE IF EXISTS print_titles;
    DROP TABLE IF EXISTS prints;

    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE prints (
      print_key TEXT PRIMARY KEY,
      set_code TEXT,
      number TEXT,
      variant TEXT,
      promo_grouping TEXT,
      provider_id TEXT,
      cost INTEGER,
      artists_json TEXT,
      foil_types_json TEXT,
      varnish_type TEXT,
      cardmarket_url TEXT
    );

    CREATE TABLE print_titles (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      full_name TEXT NOT NULL,
      name TEXT,
      version TEXT,
      set_name TEXT,
      rarity TEXT,
      card_type TEXT,
      color TEXT,
      story TEXT,
      flavor_text TEXT,
      search_name TEXT,
      image_url TEXT,
      thumbnail_url TEXT,
      full_foil_url TEXT,
      foil_mask_url TEXT,
      varnish_mask_url TEXT,
      second_varnish_mask_url TEXT,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );

    CREATE TABLE print_assets (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      art TEXT,
      thumb TEXT,
      foil_mask TEXT,
      varnish_mask TEXT,
      second_varnish_mask TEXT,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );
  `);
}

export function resetLorcanaTcgDbCache(): void {
  try {
    activeDb?.close();
  } catch {
    /* ignore */
  }
  activeDb = null;
  activePath = null;
}

export type WriteLorcanaTcgIndexInput = {
  prints: LorcanaTcgPrintRow[];
  titles: LorcanaTcgTitleRow[];
  assets: LorcanaTcgAssetRow[];
  languages: string[];
  dbPath?: string;
};

function jsonOrNull(value: string[] | null | undefined): string | null {
  if (!value || value.length === 0) return null;
  return JSON.stringify(value);
}

function parseJsonArray(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return null;
  }
}

/** Rebuild sqlite from scrape rows (full replace). */
export function writeLorcanaTcgIndex(
  input: WriteLorcanaTcgIndexInput,
): { dbPath: string; printCount: number } {
  const dbPath = input.dbPath ?? lorcanaTcgDbPath();
  resetLorcanaTcgDbCache();
  if (existsSync(dbPath)) {
    try {
      unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  }
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  createSchema(db);

  const insertPrint = db.prepare(`
    INSERT INTO prints (
      print_key, set_code, number, variant, promo_grouping, provider_id,
      cost, artists_json, foil_types_json, varnish_type, cardmarket_url
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(print_key) DO UPDATE SET
      set_code = excluded.set_code,
      number = excluded.number,
      variant = excluded.variant,
      promo_grouping = excluded.promo_grouping,
      provider_id = excluded.provider_id,
      cost = excluded.cost,
      artists_json = excluded.artists_json,
      foil_types_json = excluded.foil_types_json,
      varnish_type = excluded.varnish_type,
      cardmarket_url = excluded.cardmarket_url
  `);
  const insertTitle = db.prepare(`
    INSERT INTO print_titles (
      print_key, lang, full_name, name, version, set_name, rarity, card_type,
      color, story, flavor_text, search_name,
      image_url, thumbnail_url, full_foil_url, foil_mask_url, varnish_mask_url,
      second_varnish_mask_url
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      full_name = excluded.full_name,
      name = excluded.name,
      version = excluded.version,
      set_name = excluded.set_name,
      rarity = excluded.rarity,
      card_type = excluded.card_type,
      color = excluded.color,
      story = excluded.story,
      flavor_text = excluded.flavor_text,
      search_name = excluded.search_name,
      image_url = excluded.image_url,
      thumbnail_url = excluded.thumbnail_url,
      full_foil_url = excluded.full_foil_url,
      foil_mask_url = excluded.foil_mask_url,
      varnish_mask_url = excluded.varnish_mask_url,
      second_varnish_mask_url = excluded.second_varnish_mask_url
  `);
  const insertAsset = db.prepare(`
    INSERT INTO print_assets (
      print_key, lang, art, thumb, foil_mask, varnish_mask, second_varnish_mask
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      art = COALESCE(excluded.art, art),
      thumb = COALESCE(excluded.thumb, thumb),
      foil_mask = COALESCE(excluded.foil_mask, foil_mask),
      varnish_mask = COALESCE(excluded.varnish_mask, varnish_mask),
      second_varnish_mask = COALESCE(excluded.second_varnish_mask, second_varnish_mask)
  `);

  db.exec("BEGIN");
  for (const row of input.prints) {
    insertPrint.run(
      row.printKey,
      row.setCode ?? null,
      row.number ?? null,
      row.variant ?? null,
      row.promoGrouping ?? null,
      row.providerId ?? null,
      row.cost ?? null,
      jsonOrNull(row.artists),
      jsonOrNull(row.foilTypes),
      row.varnishType ?? null,
      row.cardmarketUrl ?? null,
    );
  }
  for (const row of input.titles) {
    insertTitle.run(
      row.printKey,
      row.lang,
      row.fullName,
      row.name ?? null,
      row.version ?? null,
      row.setName ?? null,
      row.rarity ?? null,
      row.cardType ?? null,
      row.color ?? null,
      row.story ?? null,
      row.flavorText ?? null,
      row.searchName ?? null,
      row.imageUrl ?? null,
      row.thumbnailUrl ?? null,
      row.fullFoilUrl ?? null,
      row.foilMaskUrl ?? null,
      row.varnishMaskUrl ?? null,
      row.secondVarnishMaskUrl ?? null,
    );
  }
  for (const row of input.assets) {
    insertAsset.run(
      row.printKey,
      row.lang,
      row.art ?? null,
      row.thumb ?? null,
      row.foilMask ?? null,
      row.varnishMask ?? null,
      row.secondVarnishMask ?? null,
    );
  }
  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('schema_version', ?)",
  ).run(LORCANA_TCG_SCHEMA_VERSION);
  db.prepare("INSERT INTO meta (key, value) VALUES ('languages', ?)").run(
    JSON.stringify(input.languages),
  );
  db.prepare("INSERT INTO meta (key, value) VALUES ('generated_at', ?)").run(
    new Date().toISOString(),
  );
  db.exec("COMMIT");

  activeDb = db;
  activePath = dbPath;
  return { dbPath, printCount: input.prints.length };
}

/** Client-facing cards-index.json payload (filenames only + langs). */
export function exportLorcanaCardsIndexJson(
  dbPath = lorcanaTcgDbPath(),
): LorcanaCardsIndexJson | null {
  if (!existsSync(dbPath)) return null;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const generatedAt =
      (
        db.prepare("SELECT value FROM meta WHERE key = 'generated_at'").get() as
          | { value?: string }
          | undefined
      )?.value ?? new Date().toISOString();

    const rows = db
      .prepare(
        `SELECT print_key AS printKey, lang, art, thumb,
                foil_mask AS foilMask, varnish_mask AS varnishMask,
                second_varnish_mask AS secondVarnishMask
         FROM print_assets`,
      )
      .all() as Array<{
      printKey: string;
      lang: string;
      art: string | null;
      thumb: string | null;
      foilMask: string | null;
      varnishMask: string | null;
      secondVarnishMask: string | null;
    }>;

    const cards: CardsIndexV1["cards"] = {};
    for (const row of rows) {
      const parsed = parsePrintKey(row.printKey);
      if (!parsed) continue;
      const cardId = parsed.grouping
        ? `${parsed.number}-${parsed.grouping}`
        : parsed.number;
      const langFiles: CardsIndexEntry["langs"][string] = {};
      if (row.art) langFiles.art = row.art;
      if (row.thumb) langFiles.thumb = row.thumb;
      if (row.foilMask) {
        // Disk basename is mask.* after layout migration.
        langFiles.mask = row.foilMask.replace(/^foil_mask/i, "mask");
      }
      if (row.varnishMask) langFiles.varnishMask = row.varnishMask;
      if (row.secondVarnishMask) {
        langFiles.secondVarnishMask = row.secondVarnishMask;
      }
      const entry = cards[row.printKey] ?? {
        set: parsed.set,
        card: cardId,
        langs: {},
      };
      entry.langs[row.lang] = langFiles;
      cards[row.printKey] = entry;
    }

    return {
      version: 1,
      pack: "lorcana",
      generatedAt,
      cards,
    };
  } finally {
    db.close();
  }
}

type TitleSqlRow = {
  printKey: string;
  lang: string;
  fullName: string;
  name: string | null;
  version: string | null;
  setName: string | null;
  rarity: string | null;
  cardType: string | null;
  color: string | null;
  story: string | null;
  flavorText: string | null;
  searchName: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  fullFoilUrl: string | null;
  foilMaskUrl: string | null;
  varnishMaskUrl: string | null;
  secondVarnishMaskUrl: string | null;
};

const TITLE_SELECT = `
  SELECT print_key AS printKey, lang, full_name AS fullName,
         name, version, set_name AS setName, rarity,
         card_type AS cardType, color, story,
         flavor_text AS flavorText, search_name AS searchName,
         image_url AS imageUrl, thumbnail_url AS thumbnailUrl,
         full_foil_url AS fullFoilUrl, foil_mask_url AS foilMaskUrl,
         varnish_mask_url AS varnishMaskUrl,
         second_varnish_mask_url AS secondVarnishMaskUrl
  FROM print_titles
`;

function mapTitleRow(row: TitleSqlRow): LorcanaTcgTitleRow {
  return {
    printKey: row.printKey,
    lang: row.lang,
    fullName: row.fullName,
    name: row.name,
    version: row.version,
    setName: row.setName,
    rarity: row.rarity,
    cardType: row.cardType,
    color: row.color,
    story: row.story,
    flavorText: row.flavorText,
    searchName: row.searchName,
    imageUrl: row.imageUrl,
    thumbnailUrl: row.thumbnailUrl,
    fullFoilUrl: row.fullFoilUrl,
    foilMaskUrl: row.foilMaskUrl,
    varnishMaskUrl: row.varnishMaskUrl,
    secondVarnishMaskUrl: row.secondVarnishMaskUrl,
  };
}

export function lookupLorcanaTcgTitle(
  printKey: string,
  lang: string,
  dbPath = lorcanaTcgDbPath(),
): LorcanaTcgTitleRow | null {
  if (!existsSync(dbPath)) return null;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db
      .prepare(`${TITLE_SELECT} WHERE print_key = ? AND lang = ?`)
      .get(printKey, lang) as TitleSqlRow | undefined;
    if (!row) return null;
    return mapTitleRow(row);
  } finally {
    db.close();
  }
}

export function lookupLorcanaTcgPrint(
  printKey: string,
  dbPath = lorcanaTcgDbPath(),
): LorcanaTcgPrintRow | null {
  if (!existsSync(dbPath)) return null;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db
      .prepare(
        `SELECT print_key AS printKey, set_code AS setCode, number,
                variant, promo_grouping AS promoGrouping,
                provider_id AS providerId, cost,
                artists_json AS artistsJson,
                foil_types_json AS foilTypesJson,
                varnish_type AS varnishType,
                cardmarket_url AS cardmarketUrl
         FROM prints WHERE print_key = ?`,
      )
      .get(printKey) as
      | {
          printKey: string;
          setCode: string | null;
          number: string | null;
          variant: string | null;
          promoGrouping: string | null;
          providerId: string | null;
          cost: number | null;
          artistsJson: string | null;
          foilTypesJson: string | null;
          varnishType: string | null;
          cardmarketUrl: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      printKey: row.printKey,
      setCode: row.setCode,
      number: row.number,
      variant: row.variant,
      promoGrouping: row.promoGrouping,
      providerId: row.providerId,
      cost: row.cost,
      artists: parseJsonArray(row.artistsJson),
      foilTypes: parseJsonArray(row.foilTypesJson),
      varnishType: row.varnishType,
      cardmarketUrl: row.cardmarketUrl,
    };
  } finally {
    db.close();
  }
}

export function ensureLorcanaTcgIndex(): DatabaseSync | null {
  const dbPath = lorcanaTcgDbPath();
  if (!existsSync(dbPath)) return null;
  if (activeDb && activePath === dbPath) return activeDb;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  activeDb = db;
  activePath = dbPath;
  return db;
}
