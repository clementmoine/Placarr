/**
 * Naruto CCG local catalogue — `data/naruto/carddass/catalog.sqlite` (SSOT).
 * Closed corpus (Wayback carddass.fr). Server/script only.
 * `exportNarutoCardsIndexJson` remains a legacy projection helper for tests.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  japaneseCatalogueSetsForPrintNumber,
  japaneseVolumeForPrintNumber,
} from "./sources/sealed";

import type { CardsIndexEntry, CardsIndexV1 } from "@/effects/cardsIndex";
import { canonicalDataPack } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import { migrateProductsSchema } from "@/providers/shared/sealedProducts/productsSqlite";

import { parsePrintKey } from "@/core/identify/printKey";
import { appearanceSetsOf } from "./identity";
import {
  canonicalizeNarutoPrintKey,
  expandNarutoPrintsToSetScoped,
  isJpOnlyNarutoArtwork,
  isNarutoCatalogueSetCode,
  narutoDiskCardId,
  parseNarutoCollector,
} from "./identity";
import { loadSealedProductEntries } from "@/lib/collect/sealedProductsLoad";
import { foldNarutoCatalogueRecords } from "./pipeline";
import { fillNarutoTitlesFromSiblingLocales } from "./pipeline/ledgers";
import { narutoEditorialLandscapePrints } from "./search";
import { NARUTO_PACK_ID } from "./identity";
import { NARUTO_GAME } from "./parse/bandai";
import { isNarutoLangPrinted } from "./identity";
import { RAMPAGE_TORNADO_SET } from "./parse/coleka";
import { belongsOnNarutoPromoChecklist } from "./sources/promos";
import { isNarutoS6FrPrintedNumber } from "./sources/titles";

/** Coleka Tempête / Rampage Tornado (33) — FR checklist membership on `s11`. */
function rampageTornadoCollectors(): Set<string> {
  const file = path.join(
    dataRoot(),
    NARUTO_PACK_ID,
    "staging",
    "coleka-rampage-tornado",
    "cards.json",
  );
  if (!existsSync(file)) return new Set();
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      cards?: Array<{ number?: string }>;
    };
    const out = new Set<string>();
    for (const card of raw.cards ?? []) {
      const n = card.number?.trim();
      if (!n) continue;
      out.add((narutoDiskCardId(n) ?? n).toLowerCase());
    }
    return out;
  } catch {
    return new Set();
  }
}

export const NARUTO_CCG_SCHEMA_VERSION = "3";
export { NARUTO_EN_PACK_ID, NARUTO_PACK_ID } from "./identity";

export type NarutoPrintRow = {
  printKey: string;
  /** Appearance primaire (s1, s28, promo) — lookup / libellé. */
  setCode: string;
  /**
   * Toutes les séries où la carte figure (checklist papier multi-set).
   * Absent / vide → seule `setCode` compte à l’écriture de `print_sets`.
   */
  setCodes?: readonly string[];
  number: string;
  cardType: string;
  /** Folder family (`ninja`) when known. */
  family?: string | null;
  grouping?: string | null;
  sourceUrl?: string | null;
};

export type NarutoTitleRow = {
  printKey: string;
  lang: string;
  fullName: string;
  rarity?: string | null;
  /** Cross-locale fill — see `CardsIndexLangFiles.nameLocaleFrom`. */
  nameLocaleFrom?: string | null;
  /** Slug / heuristic fill — see `CardsIndexLangFiles.nameSource`. */
  nameSource?: string | null;
};

export type NarutoAssetRow = {
  printKey: string;
  lang: string;
  art?: string | null;
  /** Card-local file (`thumb.jpg`) — same convention as Lorcana. */
  thumb?: string | null;
  back?: string | null;
  sourceUrl?: string | null;
  waybackTimestamp?: string | null;
  /** False = unprinted locale (S6 FR). Omitted / true = addable. */
  printed?: boolean;
};

const activeDbs = new Map<
  string,
  { db: DatabaseSync; mtimeMs: number; generatedAt: string | null }
>();

export function narutoPackDbPath(packId: string = NARUTO_PACK_ID): string {
  if (packId === NARUTO_PACK_ID) {
    const override = process.env.PLACARR_NARUTO_DB?.trim();
    if (override) return path.resolve(override);
  }
  return path.join(dataRoot(), canonicalDataPack(packId), "catalog.sqlite");
}

export function narutoCcgDbPath(): string {
  return narutoPackDbPath(NARUTO_PACK_ID);
}

export function resetNarutoCcgDbCache(): void {
  for (const entry of activeDbs.values()) {
    try {
      entry.db.close();
    } catch {
      /* ignore */
    }
  }
  activeDbs.clear();
}

function readDbGeneratedAt(db: DatabaseSync): string | null {
  try {
    const row = db
      .prepare(`SELECT value FROM meta WHERE key = ?`)
      .get("generatedAt") as { value: string } | undefined;
    return row?.value?.trim() || null;
  } catch {
    return null;
  }
}

function createSchema(db: DatabaseSync): void {
  db.exec(`
    DROP TABLE IF EXISTS meta;
    DROP TABLE IF EXISTS print_assets;
    DROP TABLE IF EXISTS print_titles;
    DROP TABLE IF EXISTS print_sets;
    DROP TABLE IF EXISTS prints;

    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE prints (
      print_key TEXT PRIMARY KEY,
      set_code TEXT NOT NULL,
      number TEXT NOT NULL,
      card_type TEXT NOT NULL,
      grouping TEXT,
      source_url TEXT
    );

    CREATE TABLE print_sets (
      print_key TEXT NOT NULL,
      set_code TEXT NOT NULL,
      PRIMARY KEY (print_key, set_code),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );

    CREATE TABLE print_titles (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      full_name TEXT NOT NULL,
      rarity TEXT,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );

    CREATE TABLE print_assets (
      print_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      art TEXT,
      thumb TEXT,
      back TEXT,
      source_url TEXT,
      wayback_timestamp TEXT,
      printed INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (print_key, lang),
      FOREIGN KEY (print_key) REFERENCES prints(print_key) ON DELETE CASCADE
    );
  `);
}

export function writeNarutoCcgIndex(input: {
  prints: NarutoPrintRow[];
  titles?: NarutoTitleRow[];
  assets: NarutoAssetRow[];
  dbPath?: string;
  pack?: string;
  meta?: Record<string, string>;
}): { dbPath: string; printCount: number } {
  const pack = input.pack ?? NARUTO_PACK_ID;
  const dbPath = input.dbPath ?? narutoPackDbPath(pack);
  resetNarutoCcgDbCache();
  mkdirSync(path.dirname(dbPath), { recursive: true });
  /*
    On construit à côté, et on ne remplace qu'une fois l'écriture réussie.

    L'ancienne version supprimait la base avant d'écrire : une contrainte violée
    au milieu des insertions laissait alors zéro catalogue au lieu de l'ancien —
    le `ROLLBACK` ne rendait rien, le fichier ayant déjà disparu. Un index est
    dérivé et reconstructible, mais pas en une seconde : perdre le précédent
    parce que le suivant échoue coûte plus cher que le disque d'un doublon.
  */
  const buildPath = `${dbPath}.building`;
  if (existsSync(buildPath)) {
    try {
      unlinkSync(buildPath);
    } catch {
      /* ignore */
    }
  }

  const siblingFilled = fillNarutoTitlesFromSiblingLocales({
    prints: input.prints,
    titles: input.titles ?? [],
    assets: input.assets,
  });
  const folded = foldNarutoCatalogueRecords({
    prints: siblingFilled.prints,
    titles: siblingFilled.titles,
    assets: input.assets,
  });

  /*
    Set-scoped printKeys: one row per membership (`s1-ni0049` + `s5-ni0049`).
    Titles/assets are duplicated onto every expanded key that shares the
    collector number.
  */
  /*
    Deck / deck_bundle guarantees (ex. S2 starter reprints NI-008) — sets that
    appearances.json never lists. Mint `s2-ni0008` beside `s1-ni0008`.
  */
  const deckSetsByCollector = new Map<string, Set<string>>();
  for (const entry of loadSealedProductEntries(NARUTO_PACK_ID)) {
    if (entry.kind !== "deck" && entry.kind !== "deck_bundle") continue;
    const productSet = (entry.catalogueSetId ?? entry.setCode ?? "")
      .trim()
      .toLowerCase();
    for (const link of entry.guaranteedPrints ?? []) {
      const key = link.printKey?.trim();
      if (!key) continue;
      /*
        Prefer the set segment of a set-scoped guarantee key (`s2-ni0008`) —
        products-index often leaves `setCode` null on starters.
      */
      const parsed = parsePrintKey(
        canonicalizeNarutoPrintKey(
          key,
          productSet && isNarutoCatalogueSetCode(productSet)
            ? productSet
            : null,
        ),
      );
      if (!parsed || parsed.game !== "naruto") continue;
      const setFromKey = isNarutoCatalogueSetCode(parsed.set)
        ? parsed.set
        : "";
      const set =
        setFromKey ||
        (productSet && isNarutoCatalogueSetCode(productSet) ? productSet : "");
      if (!set) continue;
      const raw = isNarutoCatalogueSetCode(parsed.set)
        ? parsed.grouping
          ? `${parsed.number}-${parsed.grouping}`
          : parsed.number
        : `${parsed.set}${parsed.number}${
            parsed.grouping ? `-${parsed.grouping}` : ""
          }`;
      const collector = (narutoDiskCardId(raw) ?? raw).toLowerCase();
      const bucket = deckSetsByCollector.get(collector) ?? new Set<string>();
      bucket.add(set);
      deckSetsByCollector.set(collector, bucket);
    }
  }

  const collectorOf = (number: string, printKey: string) =>
    (narutoDiskCardId(number) ?? printKey).toLowerCase();

  /** Resolve collector for legacy + set-scoped keys (title/asset remap). */
  const collectorFromPrintKey = (printKey: string): string => {
    const parsed = parsePrintKey(printKey);
    if (!parsed || parsed.game !== "naruto") return printKey.toLowerCase();
    const raw = isNarutoCatalogueSetCode(parsed.set)
      ? parsed.grouping
        ? `${parsed.number}-${parsed.grouping}`
        : parsed.number
      : `${parsed.set}${parsed.number}${
          parsed.grouping ? `-${parsed.grouping}` : ""
        }`;
    return (narutoDiskCardId(raw) ?? raw).toLowerCase();
  };

  const rampageCollectors = rampageTornadoCollectors();

  const prepared = folded.prints.map((p) => {
    let sets = appearanceSetsOf(
      p.setCodes?.length ? p.setCodes : [p.setCode],
    );
    if (isNarutoS6FrPrintedNumber(p.number) && !sets.includes("s6")) {
      sets = [...sets, "s6"];
    }
    /*
      巻ノ : jamais dans appearances (sources EU). On les attache depuis les
      bornes numériques — une clé `maki*` distincte de `s1-*` pour le même n°.
    */
    const grouping = (p.grouping ?? "").trim().toLowerCase();
    const skipMaki =
      grouping === "ps" ||
      grouping === "promo" ||
      grouping === "prerelease" ||
      /-(ps|promo|prerelease)$/i.test(p.number);
    if (!skipMaki) {
      for (const code of japaneseCatalogueSetsForPrintNumber(p.number)) {
        if (!sets.includes(code)) sets.push(code);
      }
    }
    const collector = collectorOf(p.number, p.printKey);
    /*
      Tempête approche (Coleka 33) = checklist FR `s11`. Reprints live under
      earlier series too — mint a distinct `s11-*` key so FR titles / ownership
      don't stay stuck on s1/s3.
    */
    if (
      rampageCollectors.has(collector) &&
      !sets.includes(RAMPAGE_TORNADO_SET)
    ) {
      sets = [...sets, RAMPAGE_TORNADO_SET];
    }
    for (const code of deckSetsByCollector.get(collector) ?? []) {
      if (!sets.includes(code)) sets.push(code);
    }
    sets = sets.filter((set) => {
      if (set === "promo" && !belongsOnNarutoPromoChecklist(p.number)) {
        return false;
      }
      return true;
    });
    return { ...p, setCodes: sets };
  });
  const expandedPrints = expandNarutoPrintsToSetScoped(prepared);
  const keysByCollector = new Map<string, string[]>();
  for (const p of expandedPrints) {
    const c = collectorOf(p.number, p.printKey);
    const list = keysByCollector.get(c) ?? [];
    list.push(p.printKey);
    keysByCollector.set(c, list);
  }
  const oldKeyCollector = new Map<string, string>();
  for (const p of folded.prints) {
    oldKeyCollector.set(p.printKey, collectorOf(p.number, p.printKey));
  }
  const expandRows = <T extends { printKey: string }>(rows: readonly T[]): T[] => {
    const out: T[] = [];
    for (const row of rows) {
      const collector =
        oldKeyCollector.get(row.printKey) ??
        collectorFromPrintKey(row.printKey);
      const keys = keysByCollector.get(collector);
      if (!keys?.length) continue;
      for (const printKey of keys) {
        out.push({ ...row, printKey });
      }
    }
    return out;
  };
  /*
    FR titles must not land on EN-only series keys (s7–s10, s15, tp4…).
    Expand used to copy every locale onto every membership — checklist FR then
    listed Tempête reprints under Quest for Power, etc.
  */
  const setAcceptsTitleLang = (setCode: string, lang: string): boolean => {
    const l = lang.trim().toLowerCase();
    const set = setCode.trim().toLowerCase();
    if (!l || !set) return true;
    if (l === "en" || l === "ja") return true;
    if (l !== "fr") return true;
    if (set === "promo" || set === "prerelease") return true;
    if (set === "s6" || set === "s11" || set === "s24" || set === "s28") {
      return true;
    }
    const series = /^s(\d+)$/.exec(set);
    if (series) {
      const n = Number(series[1]);
      return n >= 1 && n <= 5;
    }
    return false;
  };
  const expandedTitles = expandRows(folded.titles).filter((row) => {
    const set = parsePrintKey(row.printKey)?.set ?? "";
    return setAcceptsTitleLang(set, row.lang);
  });
  const expandedAssets = expandRows(folded.assets ?? []);

  const db = new DatabaseSync(buildPath);
  createSchema(db);

  const insertPrint = db.prepare(`
    INSERT INTO prints (print_key, set_code, number, card_type, grouping, source_url)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(print_key) DO UPDATE SET
      set_code = excluded.set_code,
      number = excluded.number,
      card_type = excluded.card_type,
      grouping = excluded.grouping,
      source_url = excluded.source_url
  `);
  const insertPrintSet = db.prepare(`
    INSERT INTO print_sets (print_key, set_code)
    VALUES (?, ?)
    ON CONFLICT(print_key, set_code) DO NOTHING
  `);
  const insertTitle = db.prepare(`
    INSERT INTO print_titles (print_key, lang, full_name, rarity)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      full_name = excluded.full_name,
      rarity = excluded.rarity
  `);
  const insertAsset = db.prepare(`
    INSERT INTO print_assets (print_key, lang, art, thumb, back, source_url, wayback_timestamp, printed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      art = COALESCE(excluded.art, print_assets.art),
      thumb = COALESCE(excluded.thumb, print_assets.thumb),
      back = COALESCE(excluded.back, print_assets.back),
      source_url = COALESCE(excluded.source_url, print_assets.source_url),
      wayback_timestamp = COALESCE(excluded.wayback_timestamp, print_assets.wayback_timestamp),
      printed = excluded.printed
  `);

  db.exec("BEGIN");
  try {
    const metaInsert = db.prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    metaInsert.run("schemaVersion", NARUTO_CCG_SCHEMA_VERSION);
    metaInsert.run("game", NARUTO_GAME);
    metaInsert.run("pack", pack);
    metaInsert.run("generatedAt", new Date().toISOString());
    for (const [k, v] of Object.entries(input.meta ?? {})) {
      metaInsert.run(k, v);
    }

    for (const p of expandedPrints) {
      insertPrint.run(
        p.printKey,
        p.setCode,
        p.number,
        p.cardType,
        p.grouping ?? null,
        p.sourceUrl ?? null,
      );
      // Set-scoped key: membership is the key's own set (plus maki kept off EU).
      if (!/^maki\d+$/i.test(p.setCode)) {
        insertPrintSet.run(p.printKey, p.setCode);
      }
    }
    /*
      Un titre ou une face qui nomme un tirage absent viole la clé étrangère, et
      SQLite ne dit alors que « constraint failed ». On nomme le coupable : sans
      ça, la seule piste est une base vide.
    */
    const known = new Set(expandedPrints.map((p) => p.printKey));
    const jpOnlyPrintKeys = new Set(
      expandedPrints
        .filter((p) => isJpOnlyNarutoArtwork(p.number))
        .map((p) => p.printKey),
    );
    const orphans = [
      ...expandedTitles
        .filter((t) => !known.has(t.printKey))
        .map((t) => `titre ${t.printKey} (${t.lang})`),
      ...expandedAssets
        .filter((a) => !known.has(a.printKey))
        .map((a) => `face ${a.printKey} (${a.lang})`),
    ];
    if (orphans.length) {
      throw new Error(
        `${orphans.length} enregistrement(s) nomment un tirage absent de \`prints\` : ` +
          `${orphans.slice(0, 12).join(", ")}${orphans.length > 12 ? `, … (+${orphans.length - 12})` : ""}`,
      );
    }
    for (const t of expandedTitles) {
      if (t.nameLocaleFrom?.trim()) continue;
      if (
        jpOnlyPrintKeys.has(t.printKey) &&
        t.lang.toLowerCase() !== "ja"
      ) {
        continue;
      }
      insertTitle.run(t.printKey, t.lang, t.fullName, t.rarity ?? null);
    }
    for (const a of expandedAssets) {
      if (
        jpOnlyPrintKeys.has(a.printKey) &&
        a.lang.toLowerCase() !== "ja"
      ) {
        continue;
      }
      insertAsset.run(
        a.printKey,
        a.lang,
        a.art ?? null,
        a.thumb ?? null,
        a.back ?? null,
        a.sourceUrl ?? null,
        a.waybackTimestamp ?? null,
        a.printed === false ? 0 : 1,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    try {
      unlinkSync(buildPath);
    } catch {
      /* ignore */
    }
    throw error;
  }

  db.close();

  // Identity rebuild replaces the whole file — keep sealed / faces / pack docs.
  copyCatalogSideTablesFromPrevious(dbPath, buildPath);

  renameSync(buildPath, dbPath);
  /*
    Les lecteurs (Next) qui tenaient l'ancien fichier doivent le lâcher —
    sinon ils servent encore l'inode remplacé.
  */
  resetNarutoCcgDbCache();
  return { dbPath, printCount: expandedPrints.length };
}

function copyCatalogSideTablesFromPrevious(
  previousPath: string,
  buildPath: string,
): void {
  if (!existsSync(previousPath)) return;
  const build = new DatabaseSync(buildPath);
  try {
    migrateProductsSchema(build);
    build.exec(`ATTACH DATABASE '${previousPath.replace(/'/g, "''")}' AS prev`);
    const tables = [
      "products",
      "product_contents",
      "locale_specific_faces",
      "pack_documents",
    ] as const;
    for (const table of tables) {
      const has = build
        .prepare(
          `SELECT 1 AS ok FROM prev.sqlite_master WHERE type='table' AND name=?`,
        )
        .get(table) as { ok?: number } | undefined;
      if (!has?.ok) continue;
      build.exec(`DELETE FROM ${table}`);
      build.exec(`INSERT INTO ${table} SELECT * FROM prev.${table}`);
    }
    build.exec(`DETACH DATABASE prev`);
  } finally {
    build.close();
  }
}

export function exportNarutoCardsIndexJson(
  prints: NarutoPrintRow[],
  assets: NarutoAssetRow[],
  outPath: string,
  titles?: NarutoTitleRow[],
  pack: string = NARUTO_PACK_ID,
): CardsIndexV1 {
  const siblingFilled = fillNarutoTitlesFromSiblingLocales({
    prints,
    titles: titles ?? [],
    assets,
  });
  const folded = foldNarutoCatalogueRecords({
    prints: siblingFilled.prints,
    titles: siblingFilled.titles,
    assets,
  });
  const index: CardsIndexV1 = {
    version: 1,
    pack,
    generatedAt: new Date().toISOString(),
    cards: {},
  };

  const titlesByPrint = new Map<string, NarutoTitleRow[]>();
  for (const t of folded.titles) {
    const list = titlesByPrint.get(t.printKey) ?? [];
    list.push(t);
    titlesByPrint.set(t.printKey, list);
  }

  for (const p of folded.prints) {
    const jaOnly = isJpOnlyNarutoArtwork(p.number);
    const printTitles = (titlesByPrint.get(p.printKey) ?? []).filter(
      (t) => !jaOnly || t.lang.toLowerCase() === "ja",
    );
    const preferred =
      (jaOnly
        ? printTitles.find((t) => t.lang.toLowerCase() === "ja")
        : null) ??
      printTitles.find((t) => t.lang.toLowerCase() === "fr") ??
      printTitles.find((t) => t.lang.toLowerCase() === "en") ??
      printTitles[0];
    const entry: CardsIndexEntry = {
      set: p.family || p.setCode,
      card: p.number,
      langs: {},
    };
    if (preferred?.fullName) entry.name = preferred.fullName;
    if (preferred?.rarity) entry.rarity = preferred.rarity;
    /*
      Le set japonais se dérive du numéro imprimé, pas de `set_code`.

      `set_code` porte le découpage **européen** — ce qu'on a acheté en
      boutique — et une série française empaquette deux à trois 巻ノ. Résultat
      mesuré avant correction : 21 volumes japonais sur 25 éclatés sur
      plusieurs sets. La numérotation japonaise, elle, est continue sur toute
      la ligne et chaque sortie a ouvert une plage connue : c'est elle qui
      range la carte, et elle seule.
    */
    const japaneseSet = japaneseVolumeForPrintNumber(p.number)?.setCode;
    for (const t of printTitles) {
      const code = t.lang.toLowerCase();
      const slot = entry.langs[code] ?? {};
      if (t.fullName && !t.nameLocaleFrom?.trim()) slot.name = t.fullName;
      if (t.nameSource?.trim()) slot.nameSource = t.nameSource.trim();
      if (code === "ja" && japaneseSet) slot.set = japaneseSet;
      if (isNarutoLangPrinted(p.setCode, code) === false) slot.printed = false;
      entry.langs[code] = slot;
    }
    index.cards[p.printKey] = entry;
  }
  for (const a of folded.assets) {
    const entry = index.cards[a.printKey];
    if (!entry) continue;
    if (
      isJpOnlyNarutoArtwork(entry.card) &&
      a.lang.toLowerCase() !== "ja"
    ) {
      continue;
    }
    const lang = entry.langs[a.lang] ?? {};
    if (a.art) lang.art = a.art;
    if (a.thumb) lang.thumb = a.thumb;
    if (a.back) lang.back = a.back;
    if (a.printed === false) lang.printed = false;
    entry.langs[a.lang] = lang;
  }
  /*
    Le flag paysage éditorial survit au rebuild : le probe pixel ne mesure que
    la face choisie et ne peut pas voir un scan portrait couché (PR-060). Les
    dimensions du scan couché sont stampées avec — le catalogue admin en déduit
    le quart de tour.
  */
  for (const row of narutoEditorialLandscapePrints()) {
    const entry = index.cards[row.printKey];
    if (!entry) continue;
    entry.landscapePrint = true;
    const slot = row.lang ? entry.langs[row.lang] : undefined;
    if (slot && row.artW && row.artH) {
      slot.artW ??= row.artW;
      slot.artH ??= row.artH;
    }
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(index)}\n`);
  return index;
}

export function ensureNarutoPackIndex(
  packId: string = NARUTO_PACK_ID,
): DatabaseSync | null {
  const dbPath = narutoPackDbPath(packId);
  if (!existsSync(dbPath)) return null;

  let mtimeMs = 0;
  try {
    mtimeMs = statSync(dbPath).mtimeMs;
  } catch {
    return null;
  }

  const hit = activeDbs.get(packId);
  if (hit) {
    /*
      Un `rename` atomique après Catalogue Sync laisse l'ancien fd ouvert sur
      l'inode remplacé — la check-list restait à 9 promos alors que le disque
      en avait 29. On rouvre dès que mtime / generatedAt bouge.
    */
    let schemaOk = false;
    try {
      const row = hit.db
        .prepare(`SELECT value FROM meta WHERE key = ?`)
        .get("schemaVersion") as { value: string } | undefined;
      schemaOk = row?.value === NARUTO_CCG_SCHEMA_VERSION;
    } catch {
      schemaOk = false;
    }
    if (schemaOk && hit.mtimeMs === mtimeMs) {
      return hit.db;
    }
    try {
      hit.db.close();
    } catch {
      /* ignore */
    }
    activeDbs.delete(packId);
  }

  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const schema = db
      .prepare(`SELECT value FROM meta WHERE key = ?`)
      .get("schemaVersion") as { value: string } | undefined;
    if (schema?.value !== NARUTO_CCG_SCHEMA_VERSION) {
      db.close();
      return null;
    }
    activeDbs.set(packId, {
      db,
      mtimeMs,
      generatedAt: readDbGeneratedAt(db),
    });
    return db;
  } catch {
    return null;
  }
}

export function ensureNarutoCcgIndex(): DatabaseSync | null {
  return ensureNarutoPackIndex(NARUTO_PACK_ID);
}

export function narutoIndexPacks(): string[] {
  const disk = canonicalDataPack(NARUTO_PACK_ID);
  if (existsSync(narutoPackDbPath(disk))) return [disk];
  return [];
}

export function lookupNarutoTitle(
  printKey: string,
  lang: string,
): NarutoTitleRow | null {
  const keys = [...new Set([printKey, canonicalizeNarutoPrintKey(printKey)])];
  for (const pack of narutoIndexPacks()) {
    const db = ensureNarutoPackIndex(pack);
    if (!db) continue;
    for (const key of keys) {
      const row = db
        .prepare(
          `SELECT print_key AS printKey, lang, full_name AS fullName, rarity
           FROM print_titles WHERE print_key = ? AND lang = ?`,
        )
        .get(key, lang) as
        | {
            printKey: string;
            lang: string;
            fullName: string;
            rarity: string | null;
          }
        | undefined;
      if (!row) continue;
      return {
        printKey: row.printKey,
        lang: row.lang,
        fullName: row.fullName,
        rarity: row.rarity,
      };
    }
  }
  return null;
}

/** Folder family for locale-specific ledger keys + labels (`ninja`, not `ni`). */
function catalogueSetOf(number: string, cardType: string, setCode: string): string {
  const family = parseNarutoCollector(number)?.family;
  if (
    family === "ninja" ||
    family === "jutsu" ||
    family === "mission" ||
    family === "client"
  ) {
    return family;
  }
  const ct = cardType.trim().toLowerCase();
  if (ct === "ni") return "ninja";
  if (ct === "te") return "jutsu";
  if (ct === "ta") return "mission";
  if (ct === "cl") return "client";
  const set = setCode.trim();
  return set || ct || "—";
}

/**
 * Build the in-memory cards index from `catalog.sqlite` — same shape as
 * `exportNarutoCardsIndexJson`, without touching the JSON file.
 */
export function loadNarutoCardsIndexFromSqlite(
  packId: string = NARUTO_PACK_ID,
  opts?: { dbPath?: string },
): CardsIndexV1 | null {
  let db: DatabaseSync | null = null;
  let owned = false;
  if (opts?.dbPath) {
    if (!existsSync(opts.dbPath)) return null;
    try {
      db = new DatabaseSync(opts.dbPath, { readOnly: true });
      owned = true;
    } catch {
      return null;
    }
  } else {
    db = ensureNarutoPackIndex(packId);
  }
  if (!db) return null;

  try {
    const prints = db
      .prepare(
        `SELECT print_key AS printKey, set_code AS setCode, number,
                card_type AS cardType, grouping
           FROM prints`,
      )
      .all() as Array<{
      printKey: string;
      setCode: string;
      number: string;
      cardType: string;
      grouping: string | null;
    }>;
    if (!prints.length) return null;

    const titles = db
      .prepare(
        `SELECT print_key AS printKey, lang, full_name AS fullName, rarity
           FROM print_titles`,
      )
      .all() as Array<{
      printKey: string;
      lang: string;
      fullName: string;
      rarity: string | null;
    }>;

    const assets = db
      .prepare(
        `SELECT print_key AS printKey, lang, art, thumb, back, printed
           FROM print_assets`,
      )
      .all() as Array<{
      printKey: string;
      lang: string;
      art: string | null;
      thumb: string | null;
      back: string | null;
      printed: number | null;
    }>;

    const titlesByPrint = new Map<string, typeof titles>();
    for (const t of titles) {
      const list = titlesByPrint.get(t.printKey) ?? [];
      list.push(t);
      titlesByPrint.set(t.printKey, list);
    }

    const index: CardsIndexV1 = {
      version: 1,
      pack: packId,
      generatedAt: new Date().toISOString(),
      cards: {},
    };

    for (const p of prints) {
      const jaOnly = isJpOnlyNarutoArtwork(p.number);
      const printTitles = (titlesByPrint.get(p.printKey) ?? []).filter(
        (t) => !jaOnly || t.lang.toLowerCase() === "ja",
      );
      const preferred =
        (jaOnly
          ? printTitles.find((t) => t.lang.toLowerCase() === "ja")
          : null) ??
        printTitles.find((t) => t.lang.toLowerCase() === "fr") ??
        printTitles.find((t) => t.lang.toLowerCase() === "en") ??
        printTitles[0];
      const entry: CardsIndexEntry = {
        set: catalogueSetOf(p.number, p.cardType, p.setCode),
        card: p.number,
        langs: {},
      };
      if (preferred?.fullName) entry.name = preferred.fullName;
      if (preferred?.rarity) entry.rarity = preferred.rarity;
      const japaneseSet = japaneseVolumeForPrintNumber(p.number)?.setCode;
      for (const t of printTitles) {
        const code = t.lang.toLowerCase();
        const slot = entry.langs[code] ?? {};
        if (t.fullName?.trim()) slot.name = t.fullName.trim();
        if (code === "ja" && japaneseSet) slot.set = japaneseSet;
        if (isNarutoLangPrinted(p.setCode, code) === false) slot.printed = false;
        entry.langs[code] = slot;
      }
      index.cards[p.printKey] = entry;
    }

    for (const a of assets) {
      const entry = index.cards[a.printKey];
      if (!entry) continue;
      if (
        isJpOnlyNarutoArtwork(entry.card) &&
        a.lang.toLowerCase() !== "ja"
      ) {
        continue;
      }
      const lang = entry.langs[a.lang] ?? {};
      if (a.art) lang.art = a.art;
      if (a.thumb) lang.thumb = a.thumb;
      if (a.back) lang.back = a.back;
      if (a.printed === 0) lang.printed = false;
      entry.langs[a.lang] = lang;
    }

    for (const row of narutoEditorialLandscapePrints()) {
      const entry = index.cards[row.printKey];
      if (!entry) continue;
      entry.landscapePrint = true;
      const slot = row.lang ? entry.langs[row.lang] : undefined;
      if (slot && row.artW && row.artH) {
        slot.artW ??= row.artW;
        slot.artH ??= row.artH;
      }
    }

    return index;
  } finally {
    if (owned && db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }
}
