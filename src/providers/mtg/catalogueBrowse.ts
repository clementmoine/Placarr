/**
 * Admin Catalogue browse for Magic — sqlite titles + local faces only
 * (no Scryfall CDN in the grid; densify via Sync / seed).
 */
import { existsSync, statSync } from "node:fs";

import type { CatalogueCardRow } from "@/lib/admin/catalogueCards";
import { cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import { overscanFilterPage } from "@/lib/admin/catalogueOverscan";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import { packCatalogDb } from "@/lib/packPaths";
import {
  createLocalPrintsIndex,
  type LocalPrintSearchRow,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { clearMtgArtUrlCache } from "./artUrls";
import { MTG_PACK_ID } from "./pack";

type Cache = { stamp: string; rows: CatalogueCardRow[] };
let cache: Cache | null = null;

function sqliteMtimeMs(): number {
  const file = packCatalogDb(MTG_PACK_ID);
  try {
    if (!existsSync(file)) return 0;
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function cacheStamp(): string {
  return String(sqliteMtimeMs());
}

function diskCardOf(row: LocalPrintSearchRow): string {
  return row.grouping ? `${row.number}-${row.grouping}` : row.number;
}

function rowToCatalogueCard(row: LocalPrintSearchRow): CatalogueCardRow {
  const set = (row.setCode || row.cardType || "").trim() || "—";
  const diskCard = diskCardOf(row);
  const artFile = row.art?.trim() || row.thumb?.trim() || "";
  const thumbFile =
    row.thumb?.trim() && row.thumb.trim() !== artFile
      ? row.thumb.trim()
      : "";
  const artUrl = artFile
    ? assetsCardUrl(
        MTG_PACK_ID,
        { set, lang: row.lang, card: diskCard },
        artFile,
      )
    : "";
  const artLang = row.lang;
  const name = row.fullName?.trim() || undefined;
  const label = name
    ? `${set} · ${diskCard} — ${name}`
    : `${set} · ${diskCard}`;
  return {
    printKey: row.printKey,
    set,
    card: diskCard,
    lang: row.lang,
    artUrl,
    ...(thumbFile
      ? {
          thumbUrl: assetsCardUrl(
            MTG_PACK_ID,
            { set, lang: row.lang, card: diskCard },
            thumbFile,
          ),
        }
      : {}),
    hasFoil: false,
    label,
    ...(name ? { name } : {}),
    ...(row.rarity?.trim() ? { rarity: row.rarity.trim() } : {}),
    missingArt: !artUrl,
    ...(artLang !== row.lang && artUrl ? { artLocaleFrom: artLang } : {}),
    languageSpecific: true,
    kind: "face",
  };
}

export function buildMtgCatalogueBrowseRows(): CatalogueCardRow[] {
  const index = createLocalPrintsIndex(MTG_PACK_ID);
  if (!index.hasIdentityCorpus()) return [];

  const stamp = cacheStamp();
  if (cache && cache.stamp === stamp) return cache.rows;

  const packInfo = cataloguePackInfo(MTG_PACK_ID);
  const locales = packInfo?.catalogueLocales ?? (["en", "fr"] as const);

  const byKeyLang = new Map<string, CatalogueCardRow>();
  for (const lang of locales) {
    for (const row of index.listRowsForLanguage(lang)) {
      const card = rowToCatalogueCard(row);
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
  cache = { stamp, rows };
  return rows;
}

export function clearMtgCatalogueBrowseCache(): void {
  cache = null;
  clearMtgArtUrlCache();
}

export type MtgCatalogueBrowsePageInput = {
  langs: readonly string[];
  q?: string;
  offset: number;
  limit: number;
  missingArtOnly?: boolean;
  missingNameOnly?: boolean;
  incompleteOnly?: boolean;
};

function listMtgCatalogueBrowsePageSql(
  input: Omit<
    MtgCatalogueBrowsePageInput,
    "incompleteOnly" | "missingArtOnly"
  > & {
    missingNameOnly?: boolean;
  },
): { rows: CatalogueCardRow[]; total: number } {
  const index = createLocalPrintsIndex(MTG_PACK_ID);
  if (!index.hasIdentityCorpus()) return { rows: [], total: 0 };
  const page = index.listBrowsePage(input);
  return {
    total: page.total,
    rows: page.rows.map((row) => rowToCatalogueCard(row)),
  };
}

/**
 * Admin grid is local `/assets` only (no Scryfall CDN). Audit filters therefore
 * overscan identity rows and keep tiles still missing a local face / name —
 * Sync densify debt, not SQL `a.art IS NULL` alone (almost the whole corpus).
 */
function listMtgCatalogueBrowseAuditPage(
  input: MtgCatalogueBrowsePageInput,
): { rows: CatalogueCardRow[]; total: number } {
  return overscanFilterPage({
    offset: input.offset,
    limit: input.limit,
    maxScan: 50_000,
    chunk: 96,
    fetchPage: (offset, limit) =>
      listMtgCatalogueBrowsePageSql({
        langs: input.langs,
        q: input.q,
        offset,
        limit,
        missingNameOnly: input.missingNameOnly || undefined,
      }),
    keep: (row) => {
      if (input.incompleteOnly) {
        return row.missingArt || !row.name?.trim();
      }
      if (input.missingArtOnly && !row.missingArt) return false;
      if (input.missingNameOnly && row.name?.trim()) return false;
      return true;
    },
  });
}

export function listMtgCatalogueBrowsePage(
  input: MtgCatalogueBrowsePageInput,
): { rows: CatalogueCardRow[]; total: number } {
  if (input.incompleteOnly || input.missingArtOnly) {
    return listMtgCatalogueBrowseAuditPage(input);
  }
  return listMtgCatalogueBrowsePageSql(input);
}
