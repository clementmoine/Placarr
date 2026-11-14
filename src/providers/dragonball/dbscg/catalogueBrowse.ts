/**
 * Admin Catalogue browse rows from DBS Masters identity store (`catalog.sqlite`).
 */
import { existsSync, statSync } from "node:fs";

import type { CatalogueCardRow } from "@/lib/admin/catalogueCards";
import { overscanFilterPage } from "@/lib/admin/catalogueOverscan";
import { resolveCatalogueLocalArtUrl } from "@/providers/shared/cardCatalogue/localCatalogueFace";
import {
  DBS_CG_FACE_LANGS,
  DBS_CG_PACK_ID,
  dbsCgCardFolder,
  dbsCgDbPath,
  listDbsCgCatalogueBrowsePage,
  listDbsCgRowsForLanguage,
  type DbsCgBrowseRow,
} from "@/providers/dragonball/dbscg/indexStore";
type Cache = { mtimeMs: number; rows: CatalogueCardRow[] };
let cache: Cache | null = null;

function catalogMtimeMs(): number {
  const file = dbsCgDbPath();
  try {
    if (!existsSync(file)) return 0;
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function rowToCatalogueCard(row: DbsCgBrowseRow): CatalogueCardRow {
  const lang = (row.lang ?? "fr").trim().toLowerCase() || "fr";
  const set = (row.setCode ?? "").trim() || "—";
  const card = dbsCgCardFolder({
    number: row.number,
    grouping: row.grouping,
  });
  /*
    Browse walks the whole corpus — use cheap basename/folder scan only.
    Pixel re-rank (`dbsCgLocalArtFilename`) stays on search / picker paths.
  */
  const { artUrl, missingArt } = resolveCatalogueLocalArtUrl({
    packId: DBS_CG_PACK_ID,
    set,
    lang,
    card,
    sqliteArt: row.imageUrl,
  });
  const name = row.fullName?.trim() || undefined;
  const label = name ? `${set}-${card} — ${name}` : `${set}-${card}`;
  return {
    printKey: row.printKey,
    set,
    card,
    lang,
    artUrl,
    hasFoil: false,
    label,
    ...(name ? { name } : {}),
    ...(row.rarity?.trim() ? { rarity: row.rarity.trim() } : {}),
    missingArt,
    /*
      FR and EN are distinct printings. Identity browse emits one tile per
      locale — mark language-specific so preferred-lang catalogue filter
      does not keep both under a single UI language.
    */
    languageSpecific: true,
    kind: "face",
  };
}

export function buildDbsCgCatalogueBrowseRows(): CatalogueCardRow[] {
  const mtimeMs = catalogMtimeMs();
  if (cache && cache.mtimeMs === mtimeMs) return cache.rows;

  const byKeyLang = new Map<string, CatalogueCardRow>();
  for (const lang of DBS_CG_FACE_LANGS) {
    for (const row of listDbsCgRowsForLanguage(lang)) {
      const card = rowToCatalogueCard({ ...row, lang });
      byKeyLang.set(`${card.printKey}\0${card.lang}`, card);
    }
  }
  const rows = [...byKeyLang.values()].sort((a, b) => {
    const setCmp = a.set.localeCompare(b.set);
    if (setCmp !== 0) return setCmp;
    const cardCmp = a.card.localeCompare(b.card, undefined, { numeric: true });
    if (cardCmp !== 0) return cardCmp;
    return a.lang.localeCompare(b.lang);
  });
  cache = { mtimeMs, rows };
  return rows;
}

export function clearDbsCgCatalogueBrowseCache(): void {
  cache = null;
}

export type DbsCgCatalogueBrowsePageInput = {
  langs: readonly string[];
  q?: string;
  offset: number;
  limit: number;
  missingArtOnly?: boolean;
  missingNameOnly?: boolean;
  incompleteOnly?: boolean;
};

export function listDbsCgCatalogueBrowsePageRows(
  input: DbsCgCatalogueBrowsePageInput,
): { rows: CatalogueCardRow[]; total: number } {
  /*
    SAMPLE HTTPS in print_assets.art looks like « has art » to SQL until a
    basename is stamped. Candidate-scan then keep disk-honest missingArt.
  */
  if (input.missingArtOnly || input.incompleteOnly) {
    const { missingArtOnly: _a, incompleteOnly: _i, ...base } = input;
    return overscanFilterPage({
      offset: input.offset,
      limit: input.limit,
      maxScan: 50_000,
      chunk: Math.max(input.limit, 256),
      fetchPage: (offset, limit) => {
        const page = listDbsCgCatalogueBrowsePage({
          ...base,
          offset,
          limit,
        });
        return {
          total: page.total,
          rows: page.rows.map((row) => rowToCatalogueCard(row)),
        };
      },
      keep: (row) =>
        input.incompleteOnly
          ? Boolean(row.missingArt || !row.name?.trim())
          : Boolean(row.missingArt),
    });
  }
  const page = listDbsCgCatalogueBrowsePage(input);
  return {
    total: page.total,
    rows: page.rows.map((row) => rowToCatalogueCard(row)),
  };
}
