/**
 * Admin Catalogue browse rows from Lorcana identity store (`catalog.sqlite`).
 *
 * Same corpus as checklist / searchPrints — anti-désync contrat catalogue.
 * Tiles serve **local** `/assets/…` only (no Ravensburger CDN in the grid).
 */
import { existsSync, statSync } from "node:fs";
import path from "node:path";

import type { CatalogueCardRow } from "@/lib/admin/catalogueCards";
import { assetsCardUrl, cardDiskIdFromPrintKey } from "@/lib/packAssetUrls";
import { packCardDir } from "@/lib/packPaths";
import { listCatalogueArtBasenames } from "@/providers/shared/cardCatalogue/catalogueDiskFaceAttachments";
import {
  listLorcanaCatalogueBrowsePage,
  listLorcanaTcgRowsForLanguage,
  LORCANA_PACK_ID,
  lorcanaTcgDbPath,
  type LorcanaTcgSearchRow,
} from "@/providers/lorcana/lorcanatcg/indexStore";

/** Locales admin / checklist (EN pivot + FR). */
export const LORCANA_CATALOGUE_BROWSE_LOCALES = ["en", "fr"] as const;

type Cache = { mtimeMs: number; rows: CatalogueCardRow[] };
let cache: Cache | null = null;

function catalogMtimeMs(): number {
  const file = lorcanaTcgDbPath();
  try {
    if (!existsSync(file)) return 0;
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Local `/assets/…` face only — never CDN in the admin catalogue grid.
 * Prefer indexed basename, else first `art.*` dump (lang-first folder).
 */
export function resolveLorcanaCatalogueArtUrl(
  row: Pick<
    LorcanaTcgSearchRow,
    | "printKey"
    | "lang"
    | "art"
    | "imageUrl"
    | "thumbnailUrl"
    | "fullFoilUrl"
  >,
): string {
  const lang = (row.lang ?? "en").trim().toLowerCase() || "en";
  const diskId = cardDiskIdFromPrintKey(row.printKey, lang);
  if (!diskId) return "";
  const dir = packCardDir(LORCANA_PACK_ID, diskId);
  const preferred = row.art?.trim() || null;
  if (preferred) {
    try {
      if (existsSync(path.join(dir, preferred))) {
        return assetsCardUrl(LORCANA_PACK_ID, diskId, preferred);
      }
    } catch {
      /* fall through */
    }
  }
  const first = listCatalogueArtBasenames(dir)[0];
  return first ? assetsCardUrl(LORCANA_PACK_ID, diskId, first) : "";
}

function rowToCatalogueCard(row: LorcanaTcgSearchRow): CatalogueCardRow {
  const lang = (row.lang ?? "en").trim().toLowerCase() || "en";
  const set = (row.setCode ?? "").trim() || "—";
  const card = (row.number ?? "").trim() || "—";
  const artUrl = resolveLorcanaCatalogueArtUrl(row);
  const name =
    row.fullName?.trim() ||
    [row.name, row.version].filter(Boolean).join(" — ").trim() ||
    undefined;
  const label = name ? `${set}-${card} — ${name}` : `${set}-${card}`;
  return {
    printKey: row.printKey,
    set,
    card,
    lang,
    artUrl,
    hasFoil: Boolean(row.foilTypesJson?.trim() && row.foilTypesJson !== "[]"),
    label,
    ...(name ? { name } : {}),
    ...(row.rarity?.trim() ? { rarity: row.rarity.trim() } : {}),
    missingArt: !artUrl,
    kind: "face",
  };
}

/**
 * Une tuile par (printKey, lang) présent dans `print_titles` pour en/fr.
 */
export function buildLorcanaCatalogueBrowseRows(): CatalogueCardRow[] {
  const mtimeMs = catalogMtimeMs();
  if (cache && cache.mtimeMs === mtimeMs) return cache.rows;

  const byKeyLang = new Map<string, CatalogueCardRow>();
  for (const lang of LORCANA_CATALOGUE_BROWSE_LOCALES) {
    for (const row of listLorcanaTcgRowsForLanguage(lang)) {
      const card = rowToCatalogueCard({ ...row, lang });
      byKeyLang.set(`${card.printKey}\0${card.lang}`, card);
    }
  }
  const rows = [...byKeyLang.values()].sort((a, b) => {
    const setCmp = a.set.localeCompare(b.set, undefined, { numeric: true });
    if (setCmp !== 0) return setCmp;
    const cardCmp = a.card.localeCompare(b.card, undefined, { numeric: true });
    if (cardCmp !== 0) return cardCmp;
    return a.lang.localeCompare(b.lang);
  });
  cache = { mtimeMs, rows };
  return rows;
}

/** Test seam — drop in-process cache. */
export function clearLorcanaCatalogueBrowseCache(): void {
  cache = null;
}

export type LorcanaCatalogueBrowsePageInput = {
  langs: readonly string[];
  q?: string;
  offset: number;
  limit: number;
  missingArtOnly?: boolean;
  missingNameOnly?: boolean;
  incompleteOnly?: boolean;
  foilOnly?: boolean;
};

/** Paginated admin browse — SQL LIMIT/OFFSET. */
export function listLorcanaCatalogueBrowsePageRows(
  input: LorcanaCatalogueBrowsePageInput,
): { rows: CatalogueCardRow[]; total: number } {
  const page = listLorcanaCatalogueBrowsePage({
    langs: input.langs,
    q: input.q,
    offset: input.offset,
    limit: input.limit,
    missingArtOnly: input.missingArtOnly,
    missingNameOnly: input.missingNameOnly,
    incompleteOnly: input.incompleteOnly,
    foilOnly: input.foilOnly,
  });
  return {
    total: page.total,
    rows: page.rows.map((row) => rowToCatalogueCard(row)),
  };
}
