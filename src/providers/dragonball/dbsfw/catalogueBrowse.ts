/**
 * Admin Catalogue browse rows from DBS Fusion World identity store.
 */
import { existsSync, statSync } from "node:fs";

import type { CatalogueCardRow } from "@/lib/admin/catalogueCards";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import {
  DBS_FW_FACE_LANGS,
  DBS_FW_PACK_ID,
  dbsFwCardFolder,
  dbsFwDbPath,
  listDbsFwCatalogueBrowsePage,
  listDbsFwRowsForLanguage,
  type DbsFwBrowseRow,
} from "@/providers/dragonball/dbsfw/indexStore";
import { catalogUrlMayStayRemote } from "@/providers/shared/catalogDurableCdn";

type Cache = { mtimeMs: number; rows: CatalogueCardRow[] };
let cache: Cache | null = null;

function catalogMtimeMs(): number {
  const file = dbsFwDbPath();
  try {
    if (!existsSync(file)) return 0;
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function rowToCatalogueCard(row: DbsFwBrowseRow): CatalogueCardRow {
  const lang = (row.lang ?? "en").trim().toLowerCase() || "en";
  const set = (row.setCode ?? "").trim() || "—";
  const card = dbsFwCardFolder({
    number: row.number,
    grouping: row.grouping,
  });
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
    ? assetsCardUrl(DBS_FW_PACK_ID, { set, lang, card }, localFile)
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
    missingArt: !artUrl,
    /*
      EN and JA are distinct printings (different art). Without this flag,
      matchesCataloguePreferredLang treats tiles as neutral pickLang and keeps
      every locale under the English (or Japanese) filter.
    */
    languageSpecific: true,
    kind: "face",
  };
}

export function buildDbsFwCatalogueBrowseRows(): CatalogueCardRow[] {
  const mtimeMs = catalogMtimeMs();
  if (cache && cache.mtimeMs === mtimeMs) return cache.rows;

  const byKeyLang = new Map<string, CatalogueCardRow>();
  for (const lang of DBS_FW_FACE_LANGS) {
    for (const row of listDbsFwRowsForLanguage(lang)) {
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

export function clearDbsFwCatalogueBrowseCache(): void {
  cache = null;
}

export type DbsFwCatalogueBrowsePageInput = {
  langs: readonly string[];
  q?: string;
  offset: number;
  limit: number;
  missingArtOnly?: boolean;
  missingNameOnly?: boolean;
  incompleteOnly?: boolean;
};

export function listDbsFwCatalogueBrowsePageRows(
  input: DbsFwCatalogueBrowsePageInput,
): { rows: CatalogueCardRow[]; total: number } {
  const page = listDbsFwCatalogueBrowsePage(input);
  return {
    total: page.total,
    rows: page.rows.map((row) => rowToCatalogueCard(row)),
  };
}
