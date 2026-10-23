/**
 * Admin Catalogue browse for Magic — sqlite titles + local faces, with
 * Scryfall CDN fallback from curated/art-urls.json (same ledger as seed).
 */
import { existsSync, statSync } from "node:fs";

import type { CatalogueCardRow } from "@/lib/admin/catalogueCards";
import { cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import { packCatalogDb } from "@/lib/packPaths";
import { catalogUrlMayStayRemote } from "@/providers/shared/catalogDurableCdn";
import {
  createLocalPrintsIndex,
  type LocalPrintSearchRow,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  artUrlsMtimeMs,
  clearMtgArtUrlCache,
  loadMtgArtUrlMap,
  resolveMtgArtUrl,
} from "./artUrls";
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
  return `${sqliteMtimeMs()}:${artUrlsMtimeMs()}`;
}

function diskCardOf(row: LocalPrintSearchRow): string {
  return row.grouping ? `${row.number}-${row.grouping}` : row.number;
}

function remoteArtUrl(
  printKey: string,
  lang: string,
): { url: string; artLang: string } | null {
  const hit = resolveMtgArtUrl(loadMtgArtUrlMap(), printKey, lang);
  if (!hit) return null;
  if (
    catalogUrlMayStayRemote(hit.url) ||
    /^https?:\/\//i.test(hit.url)
  ) {
    return hit;
  }
  return null;
}

function rowToCatalogueCard(row: LocalPrintSearchRow): CatalogueCardRow {
  const set = (row.setCode || row.cardType || "").trim() || "—";
  const diskCard = diskCardOf(row);
  const artFile = row.art?.trim() || row.thumb?.trim() || "";
  const thumbFile =
    row.thumb?.trim() && row.thumb.trim() !== artFile
      ? row.thumb.trim()
      : "";
  const local = artFile
    ? assetsCardUrl(
        MTG_PACK_ID,
        { set, lang: row.lang, card: diskCard },
        artFile,
      )
    : "";
  const remote = local ? null : remoteArtUrl(row.printKey, row.lang);
  const artUrl = local || remote?.url || "";
  const artLang = local ? row.lang : remote?.artLang ?? row.lang;
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
