/**
 * Admin Catalogue browse for Naruto Kayou — LocalPrints SQL page + rarity→foil.
 */
import type { CatalogueCardRow } from "@/lib/admin/catalogueCards";
import { overscanFilterPage } from "@/lib/admin/catalogueOverscan";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import {
  createLocalPrintsIndex,
  type LocalPrintSearchRow,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { kayouShinyFinish } from "./finishes";
import { NARUTO_KAYOU_PACK_ID } from "./pack";

function diskCardOf(row: LocalPrintSearchRow): string {
  return row.grouping ? `${row.number}-${row.grouping}` : row.number;
}

export function kayouRowHasFoil(row: {
  rarity?: string | null;
}): boolean {
  return kayouShinyFinish(row.rarity) != null;
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
        NARUTO_KAYOU_PACK_ID,
        { set, lang: row.lang, card: diskCard },
        artFile,
      )
    : "";
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
            NARUTO_KAYOU_PACK_ID,
            { set, lang: row.lang, card: diskCard },
            thumbFile,
          ),
        }
      : {}),
    hasFoil: kayouRowHasFoil(row),
    label,
    ...(name ? { name } : {}),
    ...(row.rarity?.trim() ? { rarity: row.rarity.trim() } : {}),
    ...(row.printed === 0 || row.printed === false
      ? { printed: false }
      : {}),
    missingArt: !artUrl,
    languageSpecific: true,
    kind: "face",
  };
}

export type KayouCatalogueBrowsePageInput = {
  langs?: readonly string[];
  q?: string;
  offset: number;
  limit: number;
  missingArtOnly?: boolean;
  missingNameOnly?: boolean;
  incompleteOnly?: boolean;
  foilOnly?: boolean;
};

function listKayouCatalogueBrowsePageSql(
  input: Omit<KayouCatalogueBrowsePageInput, "foilOnly">,
): { rows: CatalogueCardRow[]; total: number } {
  const index = createLocalPrintsIndex(NARUTO_KAYOU_PACK_ID);
  if (!index.hasIdentityCorpus()) return { rows: [], total: 0 };
  const page = index.listBrowsePage({
    langs: input.langs?.length ? input.langs : ["en"],
    q: input.q,
    offset: input.offset,
    limit: input.limit,
    missingArtOnly: input.missingArtOnly,
    missingNameOnly: input.missingNameOnly,
    incompleteOnly: input.incompleteOnly,
  });
  return {
    total: page.total,
    rows: page.rows.map((row) => rowToCatalogueCard(row)),
  };
}

/**
 * Paginated admin browse. `foilOnly` filters rarity→shiny in-process
 * (no finish column in sqlite).
 */
export function listKayouCatalogueBrowsePage(
  input: KayouCatalogueBrowsePageInput,
): { rows: CatalogueCardRow[]; total: number } {
  if (!input.foilOnly) return listKayouCatalogueBrowsePageSql(input);

  const { foilOnly: _foilOnly, ...base } = input;
  return overscanFilterPage({
    offset: input.offset,
    limit: input.limit,
    maxScan: 4_000,
    fetchPage: (offset, limit) =>
      listKayouCatalogueBrowsePageSql({ ...base, offset, limit }),
    keep: (row) => row.hasFoil,
  });
}
