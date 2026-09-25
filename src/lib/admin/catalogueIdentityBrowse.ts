/**
 * Admin Catalogue identity browse — sqlite SSOT, all TCG packs.
 *
 * Pokémon / Lorcana / DBS cg+fw : stores dédiés.
 * Autres packs LocalPrintsIndex : `data/<pack>/catalog.sqlite`.
 * Naruto Carddass : même sqlite + face rules (collector-disk / same-number).
 *
 * @see docs/catalogue_contract.md
 */
import { existsSync, statSync } from "node:fs";

import type { CatalogueCardRow } from "@/lib/admin/catalogueCards";
import {
  cataloguePackInfo,
  type CataloguePackId,
} from "@/lib/admin/cataloguePacks";
import {
  isLocaleSpecificFace,
  loadLocaleSpecificFaces,
} from "@/lib/admin/localeSpecificFaces";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import { packCatalogDb } from "@/lib/packPaths";
import {
  buildLorcanaCatalogueBrowseRows,
  clearLorcanaCatalogueBrowseCache,
} from "@/providers/lorcana/lorcanatcg/catalogueBrowse";
import { lorcanaTcgDbPath, LORCANA_PACK_ID } from "@/providers/lorcana/lorcanatcg/indexStore";
import {
  buildDbsCgCatalogueBrowseRows,
  clearDbsCgCatalogueBrowseCache,
} from "@/providers/dragonball/dbscg/catalogueBrowse";
import { dbsCgDbPath } from "@/providers/dragonball/dbscg/indexStore";
import {
  buildDbsFwCatalogueBrowseRows,
  clearDbsFwCatalogueBrowseCache,
} from "@/providers/dragonball/dbsfw/catalogueBrowse";
import { dbsFwDbPath } from "@/providers/dragonball/dbsfw/indexStore";
import {
  buildPokemonCatalogueBrowseRows,
  clearPokemonCatalogueBrowseCache,
} from "@/providers/pokemon/tcgdex/catalogueBrowse";
import { tcgdexDbPath } from "@/providers/pokemon/tcgdex/indexStore";
import { POKEMON_PACK_ID } from "@/providers/pokemon/paths";
import {
  createLocalPrintsIndex,
  type LocalPrintSearchRow,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";
import {
  buildCarddassCatalogueBrowseRows,
  clearCarddassCatalogueBrowseCache,
} from "@/providers/naruto/narutocarddass/catalogueBrowse";
import {
  buildMtgCatalogueBrowseRows,
  clearMtgCatalogueBrowseCache,
} from "@/providers/mtg/catalogueBrowse";
import { MTG_PACK_ID } from "@/providers/mtg/pack";

type Cache = { mtimeMs: number; rows: CatalogueCardRow[] };
const localCache = new Map<string, Cache>();

function sqliteMtimeMs(file: string): number {
  try {
    if (!existsSync(file)) return 0;
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function diskCardOf(row: LocalPrintSearchRow): string {
  return row.grouping ? `${row.number}-${row.grouping}` : row.number;
}

function buildLocalPrintsBrowseRows(
  pack: CataloguePackId,
): CatalogueCardRow[] | null {
  const index = createLocalPrintsIndex(pack);
  if (!index.hasIdentityCorpus()) return null;

  const file = packCatalogDb(pack);
  const mtimeMs = sqliteMtimeMs(file);
  const hit = localCache.get(pack);
  if (hit && hit.mtimeMs === mtimeMs) return hit.rows;

  const packInfo = cataloguePackInfo(pack);
  const locales = packInfo?.catalogueLocales ?? (["fr", "en"] as const);
  const bestFaceAcrossLocales =
    packInfo?.localeArt?.bestFaceAcrossLocales === true;
  const localeSpecificFaces = bestFaceAcrossLocales
    ? loadLocaleSpecificFaces(pack)
    : null;

  const byKeyLang = new Map<string, CatalogueCardRow>();
  for (const lang of locales) {
    for (const row of index.listRowsForLanguage(lang)) {
      const diskCard = diskCardOf(row);
      const set = (row.setCode || row.cardType || "").trim() || "—";
      const languageSpecific = bestFaceAcrossLocales
        ? isLocaleSpecificFace(localeSpecificFaces, set, diskCard)
        : true;

      let artLang = row.lang;
      let artFile = row.art?.trim() || row.thumb?.trim() || "";
      let thumbFile =
        row.thumb?.trim() && row.thumb.trim() !== artFile
          ? row.thumb.trim()
          : "";

      /*
        Neutral prints (bestFaceAcrossLocales): borrow any locale's face when
        the tile lang has a title but no art yet — same contract as cards-index.
      */
      if (!artFile && bestFaceAcrossLocales && !languageSpecific) {
        const borrowed = index.lookupAssets(row.printKey, {
          preferLang: row.lang,
        });
        if (borrowed?.art || borrowed?.thumb) {
          artLang = borrowed.lang;
          artFile = borrowed.art?.trim() || borrowed.thumb?.trim() || "";
          thumbFile =
            borrowed.thumb?.trim() && borrowed.thumb.trim() !== artFile
              ? borrowed.thumb.trim()
              : "";
        }
      }

      const artUrl = artFile
        ? assetsCardUrl(pack, { set, lang: artLang, card: diskCard }, artFile)
        : "";
      const name = row.fullName?.trim() || undefined;
      const label = name
        ? `${set} · ${diskCard} — ${name}`
        : `${set} · ${diskCard}`;
      byKeyLang.set(`${row.printKey}\0${row.lang}`, {
        printKey: row.printKey,
        set,
        card: diskCard,
        lang: row.lang,
        artUrl,
        ...(thumbFile
          ? {
              thumbUrl: assetsCardUrl(
                pack,
                { set, lang: artLang, card: diskCard },
                thumbFile,
              ),
            }
          : {}),
        hasFoil: false,
        label,
        ...(name ? { name } : {}),
        ...(row.rarity?.trim() ? { rarity: row.rarity.trim() } : {}),
        missingArt: !artUrl,
        ...(artLang !== row.lang && artUrl
          ? { artLocaleFrom: artLang }
          : {}),
        languageSpecific,
        kind: "face",
      });
    }
  }
  const rows = [...byKeyLang.values()].sort((a, b) => {
    const setCmp = a.set.localeCompare(b.set);
    if (setCmp !== 0) return setCmp;
    const cardCmp = a.card.localeCompare(b.card, undefined, { numeric: true });
    if (cardCmp !== 0) return cardCmp;
    return a.lang.localeCompare(b.lang);
  });
  localCache.set(pack, { mtimeMs, rows });
  return rows;
}

/**
 * Rows from identity sqlite, or `null` when this pack has no local corpus yet.
 */
export function tryBuildIdentityCatalogueRows(
  pack: CataloguePackId,
): CatalogueCardRow[] | null {
  if (pack === POKEMON_PACK_ID) {
    if (!existsSync(tcgdexDbPath())) return null;
    return buildPokemonCatalogueBrowseRows();
  }
  if (pack === LORCANA_PACK_ID) {
    if (!existsSync(lorcanaTcgDbPath())) return null;
    return buildLorcanaCatalogueBrowseRows();
  }
  if (pack === "dragonball/cg") {
    if (!existsSync(dbsCgDbPath())) return null;
    return buildDbsCgCatalogueBrowseRows();
  }
  if (pack === "dragonball/fw") {
    if (!existsSync(dbsFwDbPath())) return null;
    return buildDbsFwCatalogueBrowseRows();
  }
  if (pack === "naruto/carddass") {
    return buildCarddassCatalogueBrowseRows();
  }
  if (pack === MTG_PACK_ID) {
    const index = createLocalPrintsIndex(MTG_PACK_ID);
    if (!index.hasIdentityCorpus()) return null;
    return buildMtgCatalogueBrowseRows();
  }
  return buildLocalPrintsBrowseRows(pack);
}

/** Test seam. */
export function clearIdentityCatalogueBrowseCache(): void {
  localCache.clear();
  clearCarddassCatalogueBrowseCache();
  clearMtgCatalogueBrowseCache();
  clearDbsFwCatalogueBrowseCache();
  clearDbsCgCatalogueBrowseCache();
  clearPokemonCatalogueBrowseCache();
  clearLorcanaCatalogueBrowseCache();
}
