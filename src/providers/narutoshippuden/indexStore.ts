import { SET_ENUMERATION_LIMIT } from "@/providers/shared/cardCatalogue/setPrints";
/**
 * Catalogue du 「NARUTO-ナルト- 疾風伝 カードゲーム」 (Bandai, 2007-2009).
 *
 * **Un autre jeu que le Carddass**, pas une extension. Mesuré le 2026-08-20 :
 * maquette différente (sous-titre latin 忍 SHINOBI / 術 JUTSU / 作 SAKUSEN,
 * gemmes rondes au lieu du losange élémentaire), pied « BANDAI 2007 »,
 * référence en 忍伝-N, et une numérotation qui **repart de 1** — `ni0001` et
 * `shi0001` sont tous deux うずまきナルト. Aucun set commun avec le Carddass,
 * dans les deux sens.
 *
 * Il vivait dans le pack `naruto/carddass` faute d'un endroit à lui, ce qui lui
 * faisait hériter du dos Carddass sur ses 313 cartes.
 *
 * **À ne pas confondre** avec le « Naruto Shippuden Collectible Card Game »
 * anglais : celui-là est la suite de la localisation américaine du Carddass, il
 * partage sa numérotation et reste dans l'autre pack. Les deux disent
 * « Shippuden » et n'ont pas une carte en commun.
 *
 * Japonais seul : 309 titres sur ces familles, tous en `ja`.
 *
 * **Ce n'est pas le jeu entier.** Ses produits scellés attestent huit actes ;
 * les listes officielles moissonnées s'arrêtent au 第四幕. La moitié des cartes
 * manque donc encore, et c'est le scellé qui l'a révélé — pas le catalogue.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { CardsIndexEntry, CardsIndexV1 } from "@/effects/cardsIndex";
import { dataRoot } from "@/lib/runtimeData";
import {
  finalizeSetOptions,
  isAnsweredQuery,
  setScopedWhere,
} from "@/providers/shared/cardCatalogue/sets";

export const NARUTO_SHIPPUDEN_PACK_ID = "naruto/shippuden";

/**
 * Les quatre familles du jeu, telles que le disque les range.
 *
 * `gaku` est une **sous-série** du 忍伝 — `忍伝-学-N`, la ligne « école » — et
 * non une famille à part : sa maquette est celle du 忍伝.
 */
export const SHIPPUDEN_FAMILIES = ["shi", "mju", "msa", "gaku"] as const;

export type ShippudenSearchRow = {
  printKey: string;
  setCode: string;
  number: string;
  cardType: string;
  grouping: string | null;
  lang: string;
  fullName: string | null;
  rarity: string | null;
  art: string | null;
  thumb: string | null;
};

export function narutoShippudenDbPath(): string {
  return path.join(dataRoot(), "naruto", "shippuden", "catalog.sqlite");
}

let activeDb: DatabaseSync | null = null;
let activePath: string | null = null;

export function resetNarutoShippudenIndexCache(): void {
  try {
    activeDb?.close();
  } catch {
    /* déjà fermée */
  }
  activeDb = null;
  activePath = null;
}

export function createNarutoShippudenSchema(db: DatabaseSync): void {
  /*
    Même forme que les autres packs de cartes — `prints` / `print_titles` /
    `print_assets` — pour que tout ce qui est commun le reste. Rien ici ne
    justifiait un schéma à soi.
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS prints (
      print_key TEXT PRIMARY KEY,
      set_code TEXT NOT NULL,
      number TEXT NOT NULL,
      card_type TEXT NOT NULL,
      grouping TEXT,
      source_url TEXT
    );

    CREATE TABLE IF NOT EXISTS print_titles (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      full_name TEXT NOT NULL,
      rarity TEXT,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS print_assets (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      art TEXT,
      thumb TEXT,
      back TEXT,
      source_url TEXT,
      printed INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_prints_set ON prints(set_code);
  `);
}

export function ensureNarutoShippudenIndex(): DatabaseSync | null {
  const dbPath = narutoShippudenDbPath();
  if (!existsSync(dbPath)) return null;
  if (activeDb && activePath === dbPath) return activeDb;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  activeDb = db;
  activePath = dbPath;
  return db;
}

export function openNarutoShippudenDbForWrite(): DatabaseSync {
  const dbPath = narutoShippudenDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  createNarutoShippudenSchema(db);
  return db;
}

/**
 * Le libellé d'un acte, tel qu'un joueur le lit.
 *
 * `maku3` → « 疾風伝 第三幕 ». Le mot **幕** (acte) est celui que Bandai emploie
 * pour cette ligne, quand le Carddass compte en **巻** (volumes) — deux jeux,
 * deux mots, et c'est ce qui les distingue à l'œil.
 */
const ACT_KANJI = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** `maku3` → 3. Rend `null` pour ce qui ne compte pas en actes. */
export function shippudenActNumber(setCode: string): number | null {
  const act = /^maku(\d+)$/i.exec(setCode.trim());
  return act ? Number(act[1]) : null;
}

export function shippudenSetLabel(setCode: string): string {
  const act = /^maku(\d+)$/i.exec(setCode.trim());
  if (act) {
    const n = Number(act[1]);
    const kanji = ACT_KANJI[n - 1];
    return kanji ? `疾風伝 第${kanji}幕` : `疾風伝 第${n}幕`;
  }
  // La sous-série « école » du 忍伝, qui ne compte pas en actes.
  if (setCode.trim().toLowerCase() === "gaku") return "忍伝-学 (série école)";
  /*
    Le Coin＋ n'est pas un acte : un distributeur qui rendait une carte et un
    jeton, entre le deuxième et le troisième. Ses huit numéros lui sont propres.
  */
  if (setCode.trim().toLowerCase() === "coin") return "Coin＋ (2007)";
  return setCode.trim().toUpperCase();
}

export function listNarutoShippudenSets(): { id: string; label: string }[] {
  const db = ensureNarutoShippudenIndex();
  if (!db) return [];
  const rows = db
    .prepare(
      `SELECT DISTINCT set_code AS setCode FROM prints
        WHERE set_code IS NOT NULL AND TRIM(set_code) <> ''`,
    )
    .all() as { setCode: string }[];
  return finalizeSetOptions(
    rows
      // `unknown` n'est pas une extension : c'est l'absence d'extension connue.
      .filter((row) => row.setCode.trim().toLowerCase() !== "unknown")
      .map((row) => ({
        id: row.setCode,
        label: shippudenSetLabel(row.setCode),
        // Le jeu n'est jamais sorti hors du Japon.
        languages: ["ja"],
        /*
          L'ordre est dans le **numéro d'acte**, pas dans le libellé : trié par
          texte, 第一幕 / 第三幕 / 第二幕 / 第四幕 sortait dans l'ordre des codes
          des kanji. 忍伝-学 n'a pas d'acte et se range donc en dernier, ce qui
          est sa place : c'est une sous-série, pas un cinquième acte.
        */
        /*
          Les sorties hors actes se rangent après eux : ni 忍伝-学 ni le Coin＋
          ne sont un neuvième acte. Elles gardent leur ordre alphabétique entre
          elles, ce qui suffit puisqu'il n'y en a que deux.
        */
        sortKey: shippudenActNumber(row.setCode),
      })),
  );
}

export function searchNarutoShippudenRows(
  query: string,
  opts: { language?: string; limit?: number; setId?: string | null } = {},
): ShippudenSearchRow[] {
  const db = ensureNarutoShippudenIndex();
  if (!db) return [];

  const trimmed = query.trim().toLowerCase();
  const setId = opts.setId?.trim();
  if (!isAnsweredQuery(trimmed, setId)) return [];

  const lang = (opts.language || "ja").toLowerCase();
  /*
    Le plafond monte à `SET_ENUMERATION_LIMIT` pour la check-list, qui doit
    énumérer un set entier : compté sur les deux cents premières lignes, un set
    de 452 cartes annonçait une complétion fausse, et fausse par excès. Le
    sélecteur, lui, ne demande jamais autant.
  */
  const limit = Math.max(1, Math.min(opts.limit ?? 40, SET_ENUMERATION_LIMIT));
  const like = `%${trimmed}%`;
  const compact = trimmed.replace(/[\s-]/g, "");

  const scope = setScopedWhere({
    setColumn: "p.set_code",
    setId,
    textClause: trimmed
      ? `LOWER(t.full_name) LIKE ?
           OR LOWER(p.print_key) LIKE ?
           OR LOWER(p.number) LIKE ?`
      : null,
    textParams: [like, like, `%${compact}%`],
  });

  return db
    .prepare(
      `SELECT p.print_key AS printKey, p.set_code AS setCode, p.number,
              p.card_type AS cardType, p.grouping,
              t.lang, t.full_name AS fullName, t.rarity,
              a.art, a.thumb
         FROM prints p
         LEFT JOIN print_titles t ON t.print_key = p.print_key
         LEFT JOIN print_assets a
                ON a.print_key = p.print_key AND a.lang = t.lang
        WHERE ${scope.where}
        ORDER BY (t.lang = ?) DESC, p.card_type, CAST(p.number AS INTEGER)
        LIMIT ?`,
    )
    .all(...scope.params, lang, limit * 3) as ShippudenSearchRow[];
}

/**
 * Exporte `cards-index.json` depuis la base — ce que lit l'écran Catalogue.
 *
 * La base est la source ; ce fichier n'en est qu'une projection, réécrite à
 * chaque passe. Le champ `set` porte la **famille** (`shi`, `mju`…) et non
 * l'acte, comme chez le Carddass : c'est elle qui range les faces sur le
 * disque, et l'index doit pouvoir les retrouver.
 */
export function exportNarutoShippudenCardsIndex(): {
  path: string;
  cards: number;
} | null {
  const db = ensureNarutoShippudenIndex();
  if (!db) return null;
  const rows = db
    .prepare(
      `SELECT p.print_key AS printKey, p.card_type AS cardType, p.number,
              t.lang, t.full_name AS fullName, t.rarity,
              a.art, a.thumb
         FROM prints p
         LEFT JOIN print_titles t ON t.print_key = p.print_key
         LEFT JOIN print_assets a
                ON a.print_key = p.print_key AND a.lang = t.lang`,
    )
    .all() as {
    printKey: string;
    cardType: string;
    number: string;
    lang: string | null;
    fullName: string | null;
    rarity: string | null;
    art: string | null;
    thumb: string | null;
  }[];

  const cards: Record<string, CardsIndexEntry> = {};
  for (const row of rows) {
    const entry = (cards[row.printKey] ??= {
      set: row.cardType,
      card: row.number,
      langs: {},
    });
    if (!row.lang) continue;
    const slot = entry.langs[row.lang] ?? {};
    if (row.fullName) slot.name = row.fullName;
    if (row.art) slot.art = row.art;
    if (row.thumb) slot.thumb = row.thumb;
    entry.langs[row.lang] = slot;
    // Le jeu n'existe qu'en japonais : son nom fait le nom affiché.
    if (!entry.name && row.fullName) entry.name = row.fullName;
    if (!entry.rarity && row.rarity) entry.rarity = row.rarity;
  }

  const dest = path.join(
    dataRoot(),
    ...NARUTO_SHIPPUDEN_PACK_ID.split("/"),
    "cards-index.json",
  );
  mkdirSync(path.dirname(dest), { recursive: true });
  const index: CardsIndexV1 = {
    version: 1,
    pack: NARUTO_SHIPPUDEN_PACK_ID,
    generatedAt: new Date().toISOString(),
    cards,
  };
  writeFileSync(dest, `${JSON.stringify(index)}\n`);
  return { path: dest, cards: Object.keys(cards).length };
}
