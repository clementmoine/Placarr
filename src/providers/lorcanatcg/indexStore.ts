import { SET_ENUMERATION_LIMIT } from "@/providers/shared/cardCatalogue/setPrints";
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

import {
  finalizeSetOptions,
  isAnsweredQuery,
  setScopedWhere,
  type SqlBindValue,
} from "@/providers/shared/cardCatalogue/sets";

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
  /**
   * `Storyborn`, `Héros`, `Prince`… — traduits par LorcanaJSON, donc rangés
   * avec les autres champs de langue et non dans `prints`.
   */
  subtypes?: string[] | null;
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
  /** Chiffres du jeu, identiques dans toutes les langues. */
  lore?: number | null;
  strength?: number | null;
  willpower?: number | null;
  inkwell?: boolean | null;
  /** Taille du set principal lue dans `fullIdentifier` (`1/204` → 204). */
  setCardCount?: number | null;
  /**
   * Teintes que jette le vernis stampé (`foilEffectColors`).
   *
   * Rien d'autre ne les prédit, et elles pilotent la couleur du vernis à
   * l'affichage. Sans cette colonne, une recherche servie par la base locale
   * les perdrait **en silence** sur les quelque 83 tirages qui en portent —
   * exactement le genre de dégradation invisible qu'on refuse.
   */
  foilEffectColors?: string[] | null;
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
      cardmarket_url TEXT,
      lore INTEGER,
      strength INTEGER,
      willpower INTEGER,
      inkwell INTEGER,
      set_card_count INTEGER,
      foil_effect_colors_json TEXT
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
      subtypes_json TEXT,
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

/** Une ligne de recherche : le tirage et son titre, joints. */
export type LorcanaTcgSearchRow = {
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
  foilEffectColorsJson: string | null;
  lore: number | null;
  strength: number | null;
  willpower: number | null;
  inkwell: number | null;
  setCardCount: number | null;
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
  subtypesJson: string | null;
  searchName: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  fullFoilUrl: string | null;
  foilMaskUrl: string | null;
  varnishMaskUrl: string | null;
  secondVarnishMaskUrl: string | null;
};

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
export function writeLorcanaTcgIndex(input: WriteLorcanaTcgIndexInput): {
  dbPath: string;
  printCount: number;
} {
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
      cost, artists_json, foil_types_json, varnish_type, cardmarket_url,
      foil_effect_colors_json,
      lore, strength, willpower, inkwell, set_card_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      foil_effect_colors_json = excluded.foil_effect_colors_json,
      cardmarket_url = excluded.cardmarket_url,
      lore = excluded.lore,
      strength = excluded.strength,
      willpower = excluded.willpower,
      inkwell = excluded.inkwell,
      set_card_count = excluded.set_card_count
  `);
  const insertTitle = db.prepare(`
    INSERT INTO print_titles (
      print_key, lang, full_name, name, version, set_name, rarity, card_type,
      color, story, flavor_text, subtypes_json, search_name,
      image_url, thumbnail_url, full_foil_url, foil_mask_url, varnish_mask_url,
      second_varnish_mask_url
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      subtypes_json = excluded.subtypes_json,
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
      jsonOrNull(row.foilEffectColors),
      row.lore ?? null,
      row.strength ?? null,
      row.willpower ?? null,
      row.inkwell == null ? null : row.inkwell ? 1 : 0,
      row.setCardCount ?? null,
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
      jsonOrNull(row.subtypes),
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
  db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(
    LORCANA_TCG_SCHEMA_VERSION,
  );
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
        db
          .prepare("SELECT value FROM meta WHERE key = 'generated_at'")
          .get() as { value?: string } | undefined
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
  subtypesJson: string | null;
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
         flavor_text AS flavorText, subtypes_json AS subtypesJson,
         search_name AS searchName,
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
    subtypes: parseJsonArray(row.subtypesJson),
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
                cardmarket_url AS cardmarketUrl,
                lore, strength, willpower, inkwell,
                set_card_count AS setCardCount,
                foil_effect_colors_json AS foilEffectColorsJson
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
          lore: number | null;
          strength: number | null;
          willpower: number | null;
          inkwell: number | null;
          setCardCount: number | null;
          foilEffectColorsJson: string | null;
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
      lore: row.lore,
      strength: row.strength,
      willpower: row.willpower,
      // SQLite ne connaît pas le booléen : 0 doit revenir `false`, pas `null`.
      inkwell: row.inkwell == null ? null : row.inkwell !== 0,
      setCardCount: row.setCardCount,
      foilEffectColors: parseJsonArray(row.foilEffectColorsJson),
    };
  } finally {
    db.close();
  }
}

/**
 * Colonnes ajoutées après coup, posées sur une base déjà écrite.
 *
 * `createSchema` recrée les tables, donc une base **neuve** les a — mais celle
 * qui est déjà sur disque, non, et la seule façon de l'y amener serait de
 * refaire toute la moisson. Une colonne manquante fait échouer la requête
 * entière : la recherche rendait zéro, et le repli distant ne se déclenchait
 * même pas puisque l'erreur survenait avant.
 */
const ADDED_PRINT_COLUMNS: ReadonlyArray<{ name: string; ddl: string }> = [
  { name: "foil_effect_colors_json", ddl: "TEXT" },
];

function migrateLorcanaTcgSchema(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  try {
    const present = new Set(
      (db.prepare(`PRAGMA table_info(prints)`).all() as { name: string }[]).map(
        (row) => row.name,
      ),
    );
    for (const column of ADDED_PRINT_COLUMNS) {
      if (present.has(column.name)) continue;
      db.exec(`ALTER TABLE prints ADD COLUMN ${column.name} ${column.ddl}`);
    }
  } catch {
    // Base illisible ou verrouillée : la recherche retombera sur le distant.
  } finally {
    db.close();
  }
}

export function ensureLorcanaTcgIndex(): DatabaseSync | null {
  const dbPath = lorcanaTcgDbPath();
  if (!existsSync(dbPath)) return null;
  if (activeDb && activePath === dbPath) return activeDb;
  migrateLorcanaTcgSchema(dbPath);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  activeDb = db;
  activePath = dbPath;
  return db;
}

/**
 * Recherche **locale**, dans la base que ce provider tient déjà.
 *
 * Le catalogue Lorcana vivait sur disque depuis toujours — 3 241 tirages, 12 318
 * titres en quatre langues — mais la recherche interrogeait les JSON distants de
 * lorcanajson.org. Deux sources pour une même question, donc deux vérités
 * possibles ; et une extension choisie dans le sélecteur ne rendait rien, les
 * identifiants de sets n'étant pas les mêmes des deux côtés.
 *
 * Les colonnes rendues ici sont exactement celles dont `toPrintCandidate` a
 * besoin : la carte est reconstruite entière, pas approchée.
 */
/**
 * `36/P2` — l'identifiant tel qu'il est imprimé, et donc tel qu'on le tape.
 *
 * Aucune colonne ne le porte sous cette forme : le catalogue range la promo
 * `36/P2` en `p2 · 36`, et une carte d'extension `12/204` en `1 · 12`, où `204`
 * est la taille du set et non son code. Un `LIKE` sur du texte ne pouvait donc
 * pas y répondre — et la recherche rendait zéro sur la référence même que porte
 * la carte. On lit les deux segments et on interroge les colonnes qui les
 * tiennent : le groupe promo (ou l'extension) d'un côté, la taille du set de
 * l'autre.
 *
 * Les deux ordres sont acceptés (`36/P2` et `P2 36`) : les vitrines écrivent
 * l'un, les tableaux de check-list l'autre.
 */
export function collectorQueryClause(
  query: string,
): { clause: string; params: SqlBindValue[] } | null {
  const tokens = query.split(/[\s/·•-]+/).filter(Boolean);
  if (tokens.length !== 2) return null;

  const digits = /^\d+$/;
  const code = /^[a-z]{1,10}\d*$/;
  let number: string | null = null;
  let scope: string | null = null;
  if (digits.test(tokens[0]!) && !digits.test(tokens[1]!)) {
    [number, scope] = [tokens[0]!, tokens[1]!];
  } else if (digits.test(tokens[1]!) && !digits.test(tokens[0]!)) {
    [scope, number] = [tokens[0]!, tokens[1]!];
  } else if (digits.test(tokens[0]!) && digits.test(tokens[1]!)) {
    // `12/204` : le second segment est la taille du set, pas son code.
    const [left, right] = tokens as [string, string];
    return {
      clause: "(p.set_card_count = ? AND CAST(p.number AS INTEGER) = ?)",
      params: [Number(right), Number(left)],
    };
  }
  if (!number || !scope || !code.test(scope)) return null;

  return {
    clause: `(LOWER(COALESCE(NULLIF(TRIM(p.promo_grouping), ''), p.set_code)) = ?
              AND CAST(p.number AS INTEGER) = ?)`,
    params: [scope, Number(number)],
  };
}

export function searchLorcanaTcgRows(
  query: string,
  opts: { language?: string; limit?: number; setId?: string | null } = {},
): LorcanaTcgSearchRow[] {
  const db = ensureLorcanaTcgIndex();
  if (!db) return [];

  const trimmed = query.trim().toLowerCase();
  const setId = opts.setId?.trim().toLowerCase();
  // Une extension seule est une question complète : « montre-moi ce set ».
  if (!isAnsweredQuery(trimmed, setId)) return [];

  const lang = (opts.language || "fr").toLowerCase();
  /*
    Le plafond monte à `SET_ENUMERATION_LIMIT` pour la check-list, qui doit
    énumérer un set entier : compté sur les deux cents premières lignes, un set
    de 452 cartes annonçait une complétion fausse, et fausse par excès. Le
    sélecteur, lui, ne demande jamais autant.
  */
  const limit = Math.max(1, Math.min(opts.limit ?? 40, SET_ENUMERATION_LIMIT));
  const like = `%${trimmed}%`;

  const collector = collectorQueryClause(trimmed);
  const scope = setScopedWhere({
    setColumn: "p.set_code",
    setId,
    textClause: trimmed
      ? `LOWER(t.full_name) LIKE ?
           OR LOWER(COALESCE(t.search_name, '')) LIKE ?
           OR LOWER(p.print_key) LIKE ?
           OR LOWER(p.set_code || '-' || p.number) LIKE ?
           ${collector ? `OR ${collector.clause}` : ""}`
      : null,
    textParams: [like, like, like, like, ...(collector?.params ?? [])],
  });

  return db
    .prepare(
      `SELECT p.print_key AS printKey, p.set_code AS setCode, p.number,
              p.variant, p.promo_grouping AS promoGrouping,
              p.provider_id AS providerId, p.cost,
              p.artists_json AS artistsJson,
              p.foil_types_json AS foilTypesJson,
              p.varnish_type AS varnishType,
              p.cardmarket_url AS cardmarketUrl,
              p.foil_effect_colors_json AS foilEffectColorsJson,
              p.lore, p.strength, p.willpower, p.inkwell,
              p.set_card_count AS setCardCount,
              t.lang, t.full_name AS fullName, t.name, t.version,
              t.set_name AS setName, t.rarity, t.card_type AS cardType,
              t.color, t.story, t.flavor_text AS flavorText,
              t.subtypes_json AS subtypesJson, t.search_name AS searchName,
              t.image_url AS imageUrl, t.thumbnail_url AS thumbnailUrl,
              t.full_foil_url AS fullFoilUrl,
              t.foil_mask_url AS foilMaskUrl,
              t.varnish_mask_url AS varnishMaskUrl,
              t.second_varnish_mask_url AS secondVarnishMaskUrl
         FROM prints p
         JOIN print_titles t ON t.print_key = p.print_key
        WHERE ${scope.where}
        ORDER BY (t.lang = ?) DESC,
                 CAST(p.set_code AS INTEGER), CAST(p.number AS INTEGER)
        LIMIT ?`,
    )
    .all(...scope.params, lang, limit * 4) as LorcanaTcgSearchRow[];
}

/**
 * Les extensions du catalogue local, telles qu'un joueur les nomme.
 *
 * Le nom est pris **dans la langue demandée**. Un simple `MIN()` sur toutes les
 * langues rendait le premier par ordre alphabétique — donc « Archazia's Island »
 * à un utilisateur français, alors que la base tient « L'Isola di Archazia » et
 * « Contrées Inconnues » juste à côté.
 */
export function listLorcanaTcgSets(
  language = "fr",
): { id: string; label: string }[] {
  const db = ensureLorcanaTcgIndex();
  if (!db) return [];
  const lang = language.trim().toLowerCase();
  const rows = db
    .prepare(
      `SELECT p.set_code AS setCode,
              COALESCE(
                MIN(CASE WHEN t.lang = ? THEN NULLIF(TRIM(t.set_name), '') END),
                MIN(NULLIF(TRIM(t.set_name), ''))
              ) AS setName
         FROM prints p
         LEFT JOIN print_titles t ON t.print_key = p.print_key
        WHERE p.set_code IS NOT NULL AND TRIM(p.set_code) <> ''
        GROUP BY p.set_code`,
    )
    .all(lang) as { setCode: string; setName: string | null }[];
  return finalizeSetOptions(
    rows.map((row) => ({ id: row.setCode, label: row.setName })),
  );
}
