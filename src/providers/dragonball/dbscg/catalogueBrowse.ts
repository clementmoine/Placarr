/**
 * Admin Catalogue browse rows from DBS Masters identity store (`catalog.sqlite`).
 */
import { existsSync, statSync } from "node:fs";

import type { CatalogueCardRow } from "@/lib/admin/catalogueCards";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import {
  DBS_CG_FACE_LANGS,
  DBS_CG_PACK_ID,
  dbsCgCardFolder,
  dbsCgDbPath,
  listDbsCgCatalogueBrowsePage,
  listDbsCgRowsForLanguage,
  type DbsCgBrowseRow,
} from "@/providers/dragonball/dbscg/indexStore";
import { catalogUrlMayStayRemote } from "@/providers/shared/catalogDurableCdn";

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
    Browse must not readdir per print (`dbsCgLocalArtFilename`). Prefer the
    sqlite art basename / durable CDN URL; Sync faces pass fills assets.
  */
  const raw = row.imageUrl?.trim() || "";
  const remote =
    raw &&
    (catalogUrlMayStayRemote(raw) || /^https?:\/\//i.test(raw))
      ? raw
      : null;
  const localFile =
    raw && !remote && !raw.includes("/")
      ? raw
      : null;
  const local = localFile
    ? assetsCardUrl(DBS_CG_PACK_ID, { set, lang, card }, localFile)
    : null;
  const artUrl = local ?? remote ?? "";
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
    missingArt: !artUrl,
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
  const page = listDbsCgCatalogueBrowsePage(input);
  return {
    total: page.total,
    rows: page.rows.map((row) => rowToCatalogueCard(row)),
  };
}
