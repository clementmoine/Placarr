/**
 * Admin Catalogue browse rows from Pokémon identity store (`catalog.sqlite`).
 *
 * Same corpus as checklist / searchPrints — anti-désync contrat catalogue.
 */
import { existsSync, statSync } from "node:fs";

import { parsePrintKey } from "@/core/identify/printKey";
import type { CatalogueCardRow } from "@/lib/admin/catalogueCards";
import { overscanFilterPage } from "@/lib/admin/catalogueOverscan";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import "@/effects/pokemon/cardFoilIndex";
import {
  isPokemonPlainPrintLeaf,
} from "@/effects/pokemon/foilNames";
import { resolveEffectForPrintKey } from "@/effects/pokemon/resolveEffect";
import { localPokemonCatalogueArtUrl } from "@/providers/pokemon/tcgdex/disk/paperCardDisk";
import {
  tcgdexImageUrl,
  tcgdexLocalizedImageBase,
} from "@/providers/pokemon/tcgdex/fetch";
import {
  listTcgdexCatalogueBrowsePage,
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

/** Live foil gate is SQLite-heavy — memoize for foilOnly overscan count-through. */
const hasFoilCache = new Map<string, boolean>();

/**
 * Live dump has a non-`NonFoil` leaf for this print (prefer reverse/holo).
 * No invent from rarity — same gate as the playroom resolver.
 */
export function pokemonCatalogueHasFoil(
  printKey: string,
  lang: string,
  name?: string | null,
): boolean {
  const cacheKey = `${printKey}\0${lang}\0${name?.trim() ?? ""}`;
  const cached = hasFoilCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const resolution =
    resolveEffectForPrintKey(printKey, "holo", lang, name) ??
    resolveEffectForPrintKey(printKey, "reverse", lang, name) ??
    resolveEffectForPrintKey(printKey, null, lang, name);
  const hit = Boolean(
    resolution && !isPokemonPlainPrintLeaf(resolution.shader),
  );
  hasFoilCache.set(cacheKey, hit);
  return hit;
}

type RowToCatalogueOpts = {
  /**
   * Skip on-disk `existsSync` + Live foil resolve — for overscan keep/count
   * where only identity (or a later hydrate) matters. Default full resolve.
   */
  identityOnly?: boolean;
};

function rowToCatalogueCard(
  row: TcgdexSearchRow,
  opts?: RowToCatalogueOpts,
): CatalogueCardRow {
  const lang = (row.lang ?? "fr").trim().toLowerCase() || "fr";
  const parsed = parsePrintKey(row.printKey);
  const set = parsed?.set ?? row.setId;
  const card = parsed?.number ?? row.localId;
  const name = row.name?.trim() || undefined;
  const label = name || `${set}-${card}`;
  const printed =
    row.printed === 0 || row.printed === false ? false : undefined;
  if (opts?.identityOnly) {
    /*
      Price overscan: build asset/CDN URLs without existsSync or Live foil
      resolve (full disk harvest stayed on the hot path ~30s+ on FR).
    */
    const artBasename = row.art?.trim() || null;
    const diskId = artBasename ? tcgdexAssetDiskId(row.printKey, lang) : null;
    const fromAssets =
      artBasename && diskId
        ? assetsCardUrl("pokemon", diskId, artBasename)
        : null;
    const localizedBase = tcgdexLocalizedImageBase(row.imageBaseUrl, lang);
    const remote =
      tcgdexImageUrl(localizedBase, "low") ??
      tcgdexImageUrl(row.imageBaseUrl, "low");
    const artUrl = fromAssets ?? remote ?? "";
    return {
      printKey: row.printKey,
      set,
      card,
      lang,
      artUrl,
      hasFoil: false,
      label,
      name,
      missingArt: !artUrl,
      ...(printed === false ? { printed: false } : {}),
      kind: "face",
    };
  }
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
  return {
    printKey: row.printKey,
    set,
    card,
    lang,
    artUrl,
    hasFoil: pokemonCatalogueHasFoil(row.printKey, lang, name),
    label,
    name,
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

export type PokemonCatalogueBrowsePageInput = {
  langs: readonly string[];
  q?: string;
  offset: number;
  limit: number;
  printed?: "all" | "printed" | "unprinted";
  missingArtOnly?: boolean;
  missingNameOnly?: boolean;
  incompleteOnly?: boolean;
  /** Live non-NonFoil leaf (in-process overscan — no foil column in catalog). */
  foilOnly?: boolean;
  /**
   * Skip disk art + Live foil resolve (price overscan count-through).
   * Window rows are hydrated with a full resolve afterwards.
   */
  identityOnly?: boolean;
};

function listPokemonCatalogueBrowsePageSql(
  input: Omit<PokemonCatalogueBrowsePageInput, "foilOnly">,
): { rows: CatalogueCardRow[]; total: number } {
  const printed = input.printed ?? "all";
  const page = listTcgdexCatalogueBrowsePage({
    langs: input.langs,
    q: input.q,
    offset: input.offset,
    limit: input.limit,
    includeUnprinted: true,
    printedOnly: printed === "printed",
    unprintedOnly: printed === "unprinted",
    missingArtOnly: input.missingArtOnly,
    missingNameOnly: input.missingNameOnly,
    incompleteOnly: input.incompleteOnly,
  });
  const identityOnly = Boolean(input.identityOnly);
  return {
    total: page.total,
    rows: page.rows.map((row) => rowToCatalogueCard(row, { identityOnly })),
  };
}

function listPokemonRawBrowsePage(
  input: Omit<PokemonCatalogueBrowsePageInput, "foilOnly" | "identityOnly">,
): { rows: TcgdexSearchRow[]; total: number } {
  const printed = input.printed ?? "all";
  return listTcgdexCatalogueBrowsePage({
    langs: input.langs,
    q: input.q,
    offset: input.offset,
    limit: input.limit,
    includeUnprinted: true,
    printedOnly: printed === "printed",
    unprintedOnly: printed === "unprinted",
    missingArtOnly: input.missingArtOnly,
    missingNameOnly: input.missingNameOnly,
    incompleteOnly: input.incompleteOnly,
  });
}

/** Paginated admin browse — SQL LIMIT/OFFSET (avoids ~60k row materialize). */
export function listPokemonCatalogueBrowsePage(
  input: PokemonCatalogueBrowsePageInput,
): { rows: CatalogueCardRow[]; total: number } {
  if (input.foilOnly) {
    /*
      Early FR set order is mostly NonFoil / no Live join — first holo sits past
      ~2.6k rows. A tight maxScan returned a false-empty foilOnly page.
      Overscan raw SQL rows (Live hasFoil only) then hydrate the window —
      full disk art on 16k rows was ~20s+ of existsSync.
    */
    const { foilOnly: _f, incompleteOnly: _i, missingArtOnly: _m, identityOnly: _id, ...base } =
      input;
    const overscan = overscanFilterPage({
      offset: input.offset,
      limit: input.limit,
      maxScan: 16_000,
      chunk: 256,
      fetchPage: (offset, limit) =>
        listPokemonRawBrowsePage({ ...base, offset, limit }),
      keep: (row) => {
        const lang = (row.lang ?? "fr").trim().toLowerCase() || "fr";
        return pokemonCatalogueHasFoil(row.printKey, lang, row.name);
      },
    });
    return {
      total: overscan.total,
      rows: overscan.rows.map((row) => rowToCatalogueCard(row)),
    };
  }
  if (input.incompleteOnly || input.missingArtOnly) {
    /*
      `a.art` / `image_base_url` empty ≠ no face: `localPokemonCatalogueArtUrl`
      still finds on-disk harvests. Post-filter after resolve.
      Candidate set is ~1–2k rows — scan them all for an honest total.
    */
    const { foilOnly: _f, identityOnly: _id, ...base } = input;
    return overscanFilterPage({
      offset: input.offset,
      limit: input.limit,
      maxScan: 50_000,
      fetchPage: (offset, limit) =>
        listPokemonCatalogueBrowsePageSql({
          ...base,
          incompleteOnly: input.incompleteOnly,
          missingArtOnly: input.missingArtOnly,
          offset,
          limit,
        }),
      keep: (row) =>
        input.incompleteOnly
          ? Boolean(row.missingArt || !row.name?.trim())
          : Boolean(row.missingArt),
    });
  }
  return listPokemonCatalogueBrowsePageSql(input);
}
