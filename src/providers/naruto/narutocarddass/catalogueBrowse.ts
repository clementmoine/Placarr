/**
 * Admin Catalogue browse for Naruto Carddass — sqlite SSOT (`catalog.sqlite`).
 *
 * Identity = {@link listNarutoSetPrints} (`includeUnprinted: true`).
 * Paginated admin path: SQL LIMIT/OFFSET for identity, then the same
 * presentation rules as materialize (`resolveNarutoPrintFace`, preferred-lang
 * axis, audit filters) — never mint ghost `/cards/…` URLs from sqlite alone.
 */
import { existsSync, statSync } from "node:fs";

import {
  buildCatalogueCardRows,
  matchesCatalogueAuditFilter,
  matchesCataloguePreferredLang,
  type CatalogueCardRow,
} from "@/lib/admin/catalogueCards";
import { cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import { overscanFilterPage } from "@/lib/admin/catalogueOverscan";
import { assetsPrintFaceUrl } from "@/lib/packAssetUrls";
import { foldedLikePattern } from "@/providers/shared/sqliteFold";
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
  CARDDASS_CATALOGUE_BROWSE_LOCALES,
  matchesNarutoPreferredLocaleAxis,
} from "./preferredLocaleAxis";
import { resolveNarutoPrintFace } from "./printFaceResolve";
import { resolveNarutoLocalePrinted } from "./printedLocale";
import {
  listNarutoPrintSets,
  listNarutoSetPrints,
  searchNarutoPrints,
} from "./search";
import { attestedNarutoCarddassFinishes } from "./sources/faces";

export { CARDDASS_CATALOGUE_BROWSE_LOCALES };

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
    languageSpecific: true,
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

  ensureNarutoPackIndex(NARUTO_PACK_ID);
  const sets = listNarutoPrintSets();
  const byKey = new Map<string, CatalogueCardRow>();

  for (const set of sets) {
    for (const cand of listNarutoSetPrints({
      setId: set.id,
      language: "fr",
      includeUnprinted,
    })) {
      const row = candidateToRow(cand, set.id);
      byKey.set(`${row.printKey}\0${row.lang}`, row);
    }
  }

  for (const lang of ["en", "it", "ja"] as const) {
    for (const cand of searchNarutoPrints("", {
      language: lang,
      includeUnprinted,
      limit: 50_000,
    })) {
      const row = candidateToRow(cand, cand.setCode?.trim() || "—");
      byKey.set(`${row.printKey}\0${row.lang}`, row);
    }
  }

  const rows = [...byKey.values()];
  enumCache = { stamp, includeUnprinted, rows };
  return rows;
}

export function buildCarddassCatalogueBrowseRows(
  preferLang?: string | null,
): CatalogueCardRow[] {
  const stamp = browseStamp();
  if (cache && cache.stamp === stamp) {
    return preferLang
      ? cache.rows.filter((row) =>
          matchesCataloguePreferredLang(row, preferLang, {
            expandLocales: true,
            localeAxis: matchesNarutoPreferredLocaleAxis,
          }),
        )
      : cache.rows;
  }

  const packInfo = cataloguePackInfo(NARUTO_PACK_ID);
  const index = loadNarutoCardsIndexFromSqlite();
  const rows = buildCatalogueCardRows(
    NARUTO_PACK_ID,
    index,
    preferLang ?? null,
    {
      expandLocales: true,
      catalogueLocales: packInfo?.catalogueLocales,
    },
  );
  cache = { stamp, rows };
  return preferLang
    ? rows.filter((row) =>
        matchesCataloguePreferredLang(row, preferLang, {
          expandLocales: true,
          localeAxis: matchesNarutoPreferredLocaleAxis,
        }),
      )
    : rows;
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
  printed: number | null;
  /** Sqlite art path hint — invent-shell filter only, never minted as artUrl. */
  art?: string | null;
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

/**
 * Identity row for overscan keep (axis / foil). Sqlite `art` only hints
 * invent shells — never minted as a `/cards/…` URL.
 */
function sqlRowToCatalogueCardIdentity(
  row: NarutoSqlBrowseRow,
): CatalogueCardRow {
  const lang = (row.lang ?? "fr").trim().toLowerCase() || "fr";
  const set = (row.setCode ?? "").trim() || "—";
  const card =
    narutoDiskCardId(row.number, set) ??
    cardFromPrintKey(row.printKey) ??
    row.number;
  const name = row.fullName?.trim() || undefined;
  const label = name
    ? `${set} · ${card} — ${name}`
    : `${set} · ${card}`;
  return {
    printKey: row.printKey,
    set,
    card,
    lang,
    artUrl: "",
    hasFoil: carddassSqlRowHasFoil(row),
    label,
    ...(name ? { name } : {}),
    ...(row.rarity?.trim() ? { rarity: row.rarity.trim() } : {}),
    ...(!resolveNarutoLocalePrinted({
      setCode: set,
      lang,
      number: row.number,
    })
      ? { printed: false }
      : {}),
    // Hint only — disk truth applied in {@link hydrateCarddassCatalogueCard}.
    missingArt: !row.art?.trim(),
    languageSpecific: true,
    kind: "face",
  };
}

/**
 * Resolve face URLs honestly (existsSync + artBorrowFrom), never mint a
 * lang-first `/cards/…` ghost from sqlite `art` alone.
 */
function hydrateCarddassCatalogueCard(
  row: CatalogueCardRow,
): CatalogueCardRow {
  const lang = row.lang.trim().toLowerCase() || "fr";
  const face = resolveNarutoPrintFace({
    printKey: row.printKey,
    lang,
    role: "face",
  });
  const artUrl = face
    ? assetsPrintFaceUrl(NARUTO_PACK_ID, row.printKey, lang, "face")
    : "";
  const thumbUrl = face
    ? assetsPrintFaceUrl(NARUTO_PACK_ID, row.printKey, lang, "thumb")
    : "";
  const {
    thumbUrl: _ignoredThumb,
    artFallbackFrom: _ignoredBorrow,
    ...rest
  } = row;
  return {
    ...rest,
    artUrl,
    ...(thumbUrl && thumbUrl !== artUrl ? { thumbUrl } : {}),
    ...(face?.source === "borrowed" && face.donorPrintKey
      ? { artFallbackFrom: face.donorPrintKey }
      : {}),
    missingArt: !artUrl,
  };
}

function sqlRowToCatalogueCard(row: NarutoSqlBrowseRow): CatalogueCardRow {
  return hydrateCarddassCatalogueCard(sqlRowToCatalogueCardIdentity(row));
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
  /**
   * Preferred-lang browse (after coerce). When set with localeMode preferred,
   * applies {@link matchesCataloguePreferredLang} + Naruto axis (巻ノ / EU / CCG).
   */
  preferLang?: string | null;
  localeMode?: "preferred" | "all";
};

type CarddassSqlPageInput = Omit<
  CarddassCatalogueBrowsePageInput,
  "foilOnly" | "preferLang" | "localeMode" | "missingArtOnly" | "incompleteOnly"
> & {
  /** Name-only stays in SQL (hydrate does not change titles). */
  missingNameOnly?: boolean;
  /**
   * When false, skip disk resolve during the scan — caller hydrates the
   * kept window. Disk audits must pass true so missingArt is honest.
   */
  resolveFace?: boolean;
};

/** Identity SQL only — lang / printed / name / q. Art truth is post-hydrate. */
function listCarddassCatalogueBrowsePageSql(
  input: CarddassSqlPageInput,
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
    // Title without asset still counts as printed until a printed=0 shell exists.
    where.push("COALESCE(a.printed, 1) != 0");
  } else if (input.printed === "unprinted") {
    // Require an explicit printed=0 asset (phantoms mint a null-art shell).
    // COALESCE(NULL→1) used to hide title-only unprinted FR rows.
    where.push("a.printed = 0");
  }
  if (input.missingNameOnly) {
    where.push(`(t.full_name IS NULL OR TRIM(t.full_name) = '')`);
  }
  const q = input.q?.trim().toLowerCase();
  if (q) {
    where.push(
      `(LOWER(p.print_key) LIKE ? OR LOWER(p.set_code) LIKE ? OR LOWER(p.number) LIKE ?
        OR placarr_fold(COALESCE(t.full_name, '')) LIKE ?)`,
    );
    const like = `%${q}%`;
    params.push(like, like, like, foldedLikePattern(q));
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
              a.printed AS printed, a.art AS art
         FROM ${from}
        WHERE ${whereSql}
        ORDER BY LOWER(p.set_code), CAST(p.number AS INTEGER), p.number, t.lang
        LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as NarutoSqlBrowseRow[];
  const resolveFace = input.resolveFace !== false;
  return {
    total: Number(totalRow?.n ?? 0),
    rows: rows.map((row) =>
      resolveFace
        ? sqlRowToCatalogueCard(row)
        : sqlRowToCatalogueCardIdentity(row),
    ),
  };
}

function carddassNeedsDiskAudit(
  input: CarddassCatalogueBrowsePageInput,
): boolean {
  return Boolean(input.missingArtOnly || input.incompleteOnly);
}

function carddassNeedsPostHydrateFilter(
  input: CarddassCatalogueBrowsePageInput,
): boolean {
  if (input.foilOnly) return true;
  if (carddassNeedsDiskAudit(input)) return true;
  const localeMode = input.localeMode ?? "preferred";
  const prefer = input.preferLang?.trim().toLowerCase();
  return localeMode === "preferred" && Boolean(prefer);
}

function keepCarddassBrowseRow(
  row: CatalogueCardRow,
  input: CarddassCatalogueBrowsePageInput,
): boolean {
  if (input.foilOnly && !row.hasFoil) return false;
  /*
    Art / incomplete audits need disk hydrate. Name-only alone stays in SQL.
    When missingArt ∩ missingName (UI incomplete pair), pass both flags so
    matchesCatalogueAuditFilter ORs them the same way as materialize.
  */
  if (input.incompleteOnly || input.missingArtOnly) {
    if (
      !matchesCatalogueAuditFilter(row, {
        incompleteOnly: input.incompleteOnly,
        missingArtOnly: input.missingArtOnly,
        missingNameOnly: input.missingNameOnly,
      })
    ) {
      return false;
    }
  }
  const localeMode = input.localeMode ?? "preferred";
  const prefer = input.preferLang?.trim().toLowerCase();
  if (localeMode === "preferred" && prefer) {
    /*
      SQL identity rows are not invent shells — skip expandLocales invent
      filter; apply the provider axis only (same trait as pack info).
    */
    return matchesCataloguePreferredLang(row, prefer, {
      expandLocales: false,
      localeAxis: matchesNarutoPreferredLocaleAxis,
    });
  }
  return true;
}

/**
 * Paginated admin browse — SQL identity + shared presentation filters.
 * Preferred-lang axis / foil overscan on identity rows, then hydrate the
 * window. Disk audits (missing art / incomplete) resolve during the scan.
 */
export function listCarddassCatalogueBrowsePage(
  input: CarddassCatalogueBrowsePageInput,
): { rows: CatalogueCardRow[]; total: number } {
  const diskAudit = carddassNeedsDiskAudit(input);
  const base = {
    langs: input.langs,
    q: input.q,
    printed: input.printed,
    /*
      Name-only can stay in SQL. Art/incomplete must wait for hydrate.
      When incompleteOnly, do not pre-filter names in SQL either — a named
      card can still be incomplete via missingArt after hydrate.
    */
    missingNameOnly:
      input.missingNameOnly && !input.incompleteOnly && !input.missingArtOnly
        ? true
        : undefined,
  };

  if (!carddassNeedsPostHydrateFilter(input)) {
    return listCarddassCatalogueBrowsePageSql({
      ...base,
      offset: input.offset,
      limit: input.limit,
      resolveFace: true,
    });
  }

  const page = overscanFilterPage({
    offset: input.offset,
    limit: input.limit,
    maxScan: 8_000,
    chunk: 96,
    fetchPage: (offset, limit) =>
      listCarddassCatalogueBrowsePageSql({
        ...base,
        offset,
        limit,
        resolveFace: diskAudit,
      }),
    keep: (row) => keepCarddassBrowseRow(row, input),
  });

  if (diskAudit) return page;
  return {
    total: page.total,
    rows: page.rows.map(hydrateCarddassCatalogueCard),
  };
}
