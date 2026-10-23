/**
 * Admin Catalogue browse rows from Pokémon identity store (`catalog.sqlite`).
 *
 * Same corpus as checklist / searchPrints — anti-désync contrat catalogue.
 */
import { existsSync, statSync } from "node:fs";

import { parsePrintKey } from "@/core/identify/printKey";
import type { CatalogueCardRow } from "@/lib/admin/catalogueCards";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import { localPokemonCatalogueArtUrl } from "@/providers/pokemon/tcgdex/disk/paperCardDisk";
import {
  tcgdexImageUrl,
  tcgdexLocalizedImageBase,
} from "@/providers/pokemon/tcgdex/fetch";
import {
  listTcgdexRowsForLanguage,
  tcgdexAssetDiskId,
  tcgdexDbPath,
  type TcgdexSearchRow,
} from "@/providers/pokemon/tcgdex/indexStore";

/** Locales admin / checklist (original JA + FR + EN). */
export const POKEMON_CATALOGUE_BROWSE_LOCALES = ["ja", "fr", "en"] as const;

type Cache = { mtimeMs: number; rows: CatalogueCardRow[] };
let cache: Cache | null = null;

function printsMtimeMs(): number {
  const file = tcgdexDbPath();
  try {
    if (!existsSync(file)) return 0;
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function rowToCatalogueCard(row: TcgdexSearchRow): CatalogueCardRow {
  const lang = (row.lang ?? "fr").trim().toLowerCase() || "fr";
  const parsed = parsePrintKey(row.printKey);
  const set = parsed?.set ?? row.setId;
  const card = parsed?.number ?? row.localId;
  const artBasename = row.art?.trim() || null;
  const diskId = artBasename ? tcgdexAssetDiskId(row.printKey, lang) : null;
  const fromAssets =
    artBasename && diskId
      ? assetsCardUrl("pokemon", diskId, artBasename)
      : null;
  const local =
    fromAssets ??
    localPokemonCatalogueArtUrl(row.printKey, lang, undefined, {
      languages: [lang],
    }) ??
    null;
  const localizedBase = tcgdexLocalizedImageBase(row.imageBaseUrl, lang);
  const remote =
    tcgdexImageUrl(localizedBase, "low") ??
    tcgdexImageUrl(row.imageBaseUrl, "low");
  const artUrl = local ?? remote ?? "";
  const label = row.name?.trim() || `${set}-${card}`;
  const printed =
    row.printed === 0 || row.printed === false ? false : undefined;
  return {
    printKey: row.printKey,
    set,
    card,
    lang,
    artUrl,
    hasFoil: false,
    label,
    name: row.name?.trim() || undefined,
    missingArt: !artUrl,
    ...(printed === false ? { printed: false } : {}),
    kind: "face",
  };
}

/**
 * Une tuile par (printKey, lang) présent dans `print_titles` pour ja/fr/en.
 * Inclut `printed: false` (Pocket / misc) — filtre UI admin.
 */
export function buildPokemonCatalogueBrowseRows(): CatalogueCardRow[] {
  const mtimeMs = printsMtimeMs();
  if (cache && cache.mtimeMs === mtimeMs) return cache.rows;

  const byKeyLang = new Map<string, CatalogueCardRow>();
  for (const lang of POKEMON_CATALOGUE_BROWSE_LOCALES) {
    for (const row of listTcgdexRowsForLanguage(lang, {
      includeUnprinted: true,
    })) {
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

/** Test seam — drop in-process cache. */
export function clearPokemonCatalogueBrowseCache(): void {
  cache = null;
}
