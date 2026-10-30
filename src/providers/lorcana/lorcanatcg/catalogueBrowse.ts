/**
 * Admin Catalogue browse rows from Lorcana identity store (`catalog.sqlite`).
 *
 * Same corpus as checklist / searchPrints — anti-désync contrat catalogue.
 */
import { existsSync, statSync } from "node:fs";
import path from "node:path";

import type { CatalogueCardRow } from "@/lib/admin/catalogueCards";
import { assetsCardUrl, cardDiskIdFromPrintKey } from "@/lib/packAssetUrls";
import { packCardDir } from "@/lib/packPaths";
import {
  listLorcanaCatalogueBrowsePage,
  listLorcanaTcgRowsForLanguage,
  lorcanaTcgDbPath,
  type LorcanaTcgSearchRow,
} from "@/providers/lorcana/lorcanatcg/indexStore";
import { catalogUrlMayStayRemote } from "@/providers/shared/catalogDurableCdn";

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

function localLorcanaArtUrl(
  printKey: string,
  lang: string,
): string | null {
  const id = cardDiskIdFromPrintKey(printKey, lang);
  if (!id) return null;
  const dir = packCardDir("lorcana", id);
  for (const file of ["art.webp", "art.png", "art.jpg"] as const) {
    try {
      if (existsSync(path.join(dir, file))) {
        return assetsCardUrl("lorcana", id, file);
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function remoteArtUrl(row: LorcanaTcgSearchRow): string | null {
  const candidates = [
    row.fullFoilUrl,
    row.imageUrl,
    row.thumbnailUrl,
  ].filter((u): u is string => Boolean(u?.trim()));
  for (const url of candidates) {
    if (catalogUrlMayStayRemote(url) || /^https?:\/\//i.test(url)) {
      return url;
    }
  }
  return null;
}

/**
 * Prefer sqlite art basename / remote CDN — `existsSync` only as last resort
 * (cold browse was ~3 stats × every title).
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
  const artBasename = row.art?.trim() || null;
  const diskId = artBasename
    ? cardDiskIdFromPrintKey(row.printKey, lang)
    : null;
  const fromAssets =
    artBasename && diskId
      ? assetsCardUrl("lorcana", diskId, artBasename)
      : null;
  const remote = remoteArtUrl(row as LorcanaTcgSearchRow);
  return fromAssets ?? remote ?? localLorcanaArtUrl(row.printKey, lang) ?? "";
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
    foilOnly: input.foilOnly,
  });
  return {
    total: page.total,
    rows: page.rows.map((row) => rowToCatalogueCard(row)),
  };
}
