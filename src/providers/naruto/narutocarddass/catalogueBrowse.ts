/**
 * Admin Catalogue browse for Naruto Carddass — sqlite SSOT (`catalog.sqlite`).
 *
 * Identity = {@link listNarutoSetPrints} (`includeUnprinted: true`).
 * Presentation (URLs, borrow, collapse) comes from {@link buildCatalogueCardRows}.
 * Paginated admin path uses SQL LIMIT/OFFSET — no `cards/` tree walk.
 */
import { existsSync, statSync } from "node:fs";

import {
  buildCatalogueCardRows,
  type CatalogueCardRow,
} from "@/lib/admin/catalogueCards";
import { cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import { overscanFilterPage } from "@/lib/admin/catalogueOverscan";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import type { PrintCandidate } from "@/types/providerModule";

import { NARUTO_CARDDASS_FINISHES } from "@/effects/narutocarddass";

import {
  canonicalizeNarutoPrintKey,
  narutoDiskCardId,
  NARUTO_PACK_ID,
} from "./identity";
import {
  ensureNarutoPackIndex,
  loadNarutoCardsIndexFromSqlite,
  narutoPackDbPath,
} from "./indexStore";
import {
  listNarutoPrintSets,
  listNarutoSetPrints,
  searchNarutoPrints,
} from "./search";
import { attestedNarutoCarddassFinishes } from "./sources/faces";

type Cache = { stamp: string; rows: CatalogueCardRow[] };
let cache: Cache | null = null;
let enumCache: {
  stamp: string;
  includeUnprinted: boolean;
  rows: CatalogueCardRow[];
} | null = null;

function mtimeMs(file: string): number {
  try {
    if (!existsSync(file)) return 0;
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Browse cache stamp = sqlite mtime only.
 * Walking `cards/` on every request was a multi-second tax; faces Sync updates
 * sqlite assets, which bumps mtime.
 */
function browseStamp(): string {
  return String(mtimeMs(narutoPackDbPath(NARUTO_PACK_ID)));
}

function cardFromPrintKey(printKey: string): string {
  const canon = canonicalizeNarutoPrintKey(printKey);
  const m = /^naruto:[a-z0-9]+-(.+)$/i.exec(canon);
  return m?.[1] ?? "";
}

function candidateToRow(
  cand: PrintCandidate,
  fallbackSet: string,
): CatalogueCardRow {
  const tileLang = (cand.language ?? "fr").trim().toLowerCase() || "fr";
  const setCode = cand.setCode?.trim() || fallbackSet;
  const card = cardFromPrintKey(cand.printKey);
  return {
    printKey: cand.printKey,
    set: setCode,
    card,
    lang: tileLang,
    artUrl: cand.imageUrl || cand.thumbnailUrl || "",
    ...(cand.thumbnailUrl && cand.thumbnailUrl !== cand.imageUrl
      ? { thumbUrl: cand.thumbnailUrl }
      : {}),
    hasFoil: Boolean(
      cand.finishes?.some(
        (finish) => finish !== "normal" && finish !== "sealed",
      ),
    ),
    label: cand.title?.trim()
      ? `${setCode} · ${card} — ${cand.title.trim()}`
      : `${setCode} · ${card}`,
    ...(cand.title?.trim() ? { name: cand.title.trim() } : {}),
    ...(cand.rarity?.trim() ? { rarity: cand.rarity.trim() } : {}),
    ...(cand.printed === false ? { printed: false } : {}),
    missingArt: !(cand.imageUrl || cand.thumbnailUrl),
    kind: "face",
  };
}

export { loadNarutoCardsIndexFromSqlite };

/**
 * Single Carddass enumeration — same pool as checklist / shelf.
 *
 * FR uses per-set {@link listNarutoSetPrints} (set-scoped + unions).
 * Other locales use one catalogueBrowse search (no FR paper checklist).
 */
export function enumerateNarutoSetPrints(opts?: {
  includeUnprinted?: boolean;
}): CatalogueCardRow[] {
  const includeUnprinted = opts?.includeUnprinted !== false;
  const stamp = browseStamp();
  if (
    enumCache &&
    enumCache.stamp === stamp &&
    enumCache.includeUnprinted === includeUnprinted
  ) {
    return enumCache.rows;
  }

  const locales =
    cataloguePackInfo(NARUTO_PACK_ID)?.catalogueLocales ??
    (["fr", "en", "it", "ja"] as const);
  const byKeyLang = new Map<string, CatalogueCardRow>();

  const remember = (cand: PrintCandidate, fallbackSet: string) => {
    const row = candidateToRow(cand, fallbackSet);
    const key = `${row.printKey}\0${row.lang}`;
    if (!byKeyLang.has(key)) byKeyLang.set(key, row);
  };

  for (const lang of locales) {
    if (lang === "fr") {
      for (const set of listNarutoPrintSets("fr")) {
        for (const cand of listNarutoSetPrints({
          setId: set.id,
          language: "fr",
          includeUnprinted,
        })) {
          remember(cand, set.id);
        }
      }
      continue;
    }
    for (const cand of searchNarutoPrints("", {
      language: lang,
      limit: 5000,
      catalogueBrowse: true,
      includeUnprinted,
    })) {
      remember(cand, cand.setCode?.trim() || "—");
    }
  }

  const rows = [...byKeyLang.values()];
  enumCache = { stamp, includeUnprinted, rows };
  return rows;
}

/**
 * Merge checklist identity with presentation rows (borrow URLs, collapse).
 * Faces outside the enum are dropped; enum faces missing presentation become
 * shells.
 */
function alignBrowseToSetPrintEnum(
  presentation: CatalogueCardRow[],
): CatalogueCardRow[] {
  const enumFaces = enumerateNarutoSetPrints({ includeUnprinted: true });
  const enumByKey = new Map(
    enumFaces.map((row) => [`${row.printKey}\0${row.lang}`, row] as const),
  );
  const presentationByKey = new Map(
    presentation
      .filter((row) => !row.kind || row.kind === "face")
      .map((row) => [`${row.printKey}\0${row.lang}`, row] as const),
  );
  const backs = presentation.filter(
    (row) => row.kind === "pack-back" || row.kind === "set-back",
  );

  const faces: CatalogueCardRow[] = [];
  for (const [key, identity] of enumByKey) {
    const presented = presentationByKey.get(key);
    if (presented) {
      if (identity.printed === false) {
        faces.push({ ...presented, printed: false });
      } else {
        const { printed: _drop, ...rest } = presented;
        faces.push(rest);
      }
      continue;
    }
    faces.push(identity);
  }
  return [...backs, ...faces];
}

export function buildCarddassCatalogueBrowseRows(): CatalogueCardRow[] | null {
  const stamp = browseStamp();
  if (cache && cache.stamp === stamp) return cache.rows;

  const index = loadNarutoCardsIndexFromSqlite(NARUTO_PACK_ID);
  if (!index || Object.keys(index.cards).length === 0) return null;

  const presentation = buildCatalogueCardRows(NARUTO_PACK_ID, index);
  const rows = alignBrowseToSetPrintEnum(presentation);
  cache = { stamp, rows };
  return rows;
}

export function clearCarddassCatalogueBrowseCache(): void {
  cache = null;
  enumCache = null;
}

type NarutoSqlBrowseRow = {
  printKey: string;
  setCode: string;
  number: string;
  lang: string;
  fullName: string | null;
  rarity: string | null;
  art: string | null;
  thumb: string | null;
  printed: number | null;
};

/**
 * Mirror {@link searchNarutoPrints} finish rules for admin tiles — finishes
 * live in attested ledgers / defaults, not sqlite columns.
 */
export function carddassSqlRowHasFoil(row: {
  setCode: string;
  number: string;
  printKey: string;
}): boolean {
  const set = row.setCode.trim().toLowerCase();
  const number = row.number;
  const printKey = row.printKey;
  const isPrerelease =
    /prerelease/i.test(number) || /prerelease/i.test(printKey);
  if (isPrerelease) {
    // Sealed bag / opened Normale alt — no holo cardboard on this key.
    return false;
  }
  if (set === "promo" || /(?:^|-)promo(?:-|$)/i.test(number)) {
    return NARUTO_CARDDASS_FINISHES.length > 0;
  }
  const attested = attestedNarutoCarddassFinishes(set, number);
  const finishes = attested ?? ["normal", ...NARUTO_CARDDASS_FINISHES];
  return finishes.some(
    (finish) => finish !== "normal" && finish !== "sealed",
  );
}

function sqlRowToCatalogueCard(row: NarutoSqlBrowseRow): CatalogueCardRow {
  const lang = (row.lang ?? "fr").trim().toLowerCase() || "fr";
  const set = (row.setCode ?? "").trim() || "—";
  const card =
    narutoDiskCardId(row.number, set) ??
    cardFromPrintKey(row.printKey) ??
    row.number;
  const artFile = row.art?.trim() || row.thumb?.trim() || "";
  const thumbFile =
    row.thumb?.trim() && row.thumb.trim() !== artFile
      ? row.thumb.trim()
      : "";
  const artUrl = artFile
    ? assetsCardUrl(NARUTO_PACK_ID, { set, lang, card }, artFile)
    : "";
  const name = row.fullName?.trim() || undefined;
  const label = name
    ? `${set} · ${card} — ${name}`
    : `${set} · ${card}`;
  return {
    printKey: row.printKey,
    set,
    card,
    lang,
    artUrl,
    ...(thumbFile
      ? {
          thumbUrl: assetsCardUrl(
            NARUTO_PACK_ID,
            { set, lang, card },
            thumbFile,
          ),
        }
      : {}),
    hasFoil: carddassSqlRowHasFoil(row),
    label,
    ...(name ? { name } : {}),
    ...(row.rarity?.trim() ? { rarity: row.rarity.trim() } : {}),
    ...(row.printed === 0 ? { printed: false } : {}),
    missingArt: !artUrl,
    kind: "face",
  };
}

export type CarddassCatalogueBrowsePageInput = {
  langs: readonly string[];
  q?: string;
  offset: number;
  limit: number;
  missingArtOnly?: boolean;
  missingNameOnly?: boolean;
  incompleteOnly?: boolean;
  foilOnly?: boolean;
  printed?: "all" | "printed" | "unprinted";
};

function listCarddassCatalogueBrowsePageSql(
  input: Omit<CarddassCatalogueBrowsePageInput, "foilOnly">,
): { rows: CatalogueCardRow[]; total: number } {
  const db = ensureNarutoPackIndex(NARUTO_PACK_ID);
  if (!db) return { rows: [], total: 0 };
  const langs = [
    ...new Set(
      input.langs.map((lang) => lang.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  if (!langs.length) return { rows: [], total: 0 };
  const offset = Math.max(0, Math.floor(input.offset));
  const limit = Math.max(1, Math.min(1000, Math.floor(input.limit)));
  const params: unknown[] = [];
  const where: string[] = [
    `t.lang IN (${langs.map(() => "?").join(",")})`,
  ];
  params.push(...langs);
  if (input.printed === "printed") {
    where.push("COALESCE(a.printed, 1) != 0");
  } else if (input.printed === "unprinted") {
    where.push("COALESCE(a.printed, 1) = 0");
  }
  const missingArtSql = `(a.art IS NULL OR TRIM(a.art) = '') AND (a.thumb IS NULL OR TRIM(a.thumb) = '')`;
  const missingNameSql = `(t.full_name IS NULL OR TRIM(t.full_name) = '')`;
  if (input.incompleteOnly) {
    where.push(`((${missingArtSql}) OR (${missingNameSql}))`);
  } else {
    if (input.missingArtOnly) where.push(missingArtSql);
    if (input.missingNameOnly) where.push(missingNameSql);
  }
  const q = input.q?.trim().toLowerCase();
  if (q) {
    where.push(
      `(LOWER(p.print_key) LIKE ? OR LOWER(p.set_code) LIKE ? OR LOWER(p.number) LIKE ?
        OR LOWER(COALESCE(t.full_name, '')) LIKE ?)`,
    );
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const whereSql = where.join(" AND ");
  const from = `prints p
         JOIN print_titles t ON t.print_key = p.print_key
         LEFT JOIN print_assets a
                ON a.print_key = p.print_key AND a.lang = t.lang`;
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM ${from} WHERE ${whereSql}`)
    .get(...params) as { n: number };
  const rows = db
    .prepare(
      `SELECT p.print_key AS printKey, p.set_code AS setCode, p.number,
              t.lang, t.full_name AS fullName, t.rarity,
              a.art, a.thumb, a.printed AS printed
         FROM ${from}
        WHERE ${whereSql}
        ORDER BY LOWER(p.set_code), CAST(p.number AS INTEGER), p.number, t.lang
        LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as NarutoSqlBrowseRow[];
  return {
    total: Number(totalRow?.n ?? 0),
    rows: rows.map(sqlRowToCatalogueCard),
  };
}

/**
 * Paginated admin browse — SQL LIMIT/OFFSET (avoids full Carddass materialize).
 * `foilOnly` filters attested/default finishes in-process (no finish column).
 */
export function listCarddassCatalogueBrowsePage(
  input: CarddassCatalogueBrowsePageInput,
): { rows: CatalogueCardRow[]; total: number } {
  if (!input.foilOnly) return listCarddassCatalogueBrowsePageSql(input);

  const { foilOnly: _foilOnly, ...base } = input;
  return overscanFilterPage({
    offset: input.offset,
    limit: input.limit,
    maxScan: 4_000,
    fetchPage: (offset, limit) =>
      listCarddassCatalogueBrowsePageSql({ ...base, offset, limit }),
    keep: (row) => row.hasFoil,
  });
}
