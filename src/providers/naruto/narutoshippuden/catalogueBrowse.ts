/**
 * Admin Catalogue browse for 疾風伝 — sqlite SSOT.
 *
 * Disk folders stay Latin (`gaku/ja/gaku0038/`); tiles show printed types
 * (`忍伝-学007`, not `gaku · gaku0007`).
 */
import { existsSync, statSync } from "node:fs";

import type { CatalogueCardRow } from "@/lib/admin/catalogueCards";
import {
  createLocalPrintsIndex,
  type LocalPrintSearchRow,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  narutoShippudenAssetsCardUrl,
} from "./assets";
import {
  NARUTO_SHIPPUDEN_PACK_ID,
  narutoShippudenDbPath,
  shippudenSetLabel,
} from "./indexStore";
import {
  formatShippudenReference,
  shippudenFamilyLabel,
} from "./search";

type Cache = { mtimeMs: number; rows: CatalogueCardRow[] };
let cache: Cache | null = null;

function sqliteMtimeMs(): number {
  const file = narutoShippudenDbPath();
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

function rowToCatalogueCard(row: LocalPrintSearchRow): CatalogueCardRow {
  const family = row.cardType.trim().toLowerCase() || "—";
  const diskCard = diskCardOf(row);
  const lang = (row.lang ?? "ja").trim().toLowerCase() || "ja";
  const artFile = row.art?.trim() || row.thumb?.trim() || "";
  const thumbFile =
    row.thumb?.trim() && row.thumb.trim() !== artFile
      ? row.thumb.trim()
      : "";
  const artUrl = artFile
    ? narutoShippudenAssetsCardUrl(family, diskCard, lang, artFile)
    : "";
  const reference = formatShippudenReference(family, diskCard);
  const name = row.fullName?.trim() || undefined;
  const setDisplay = shippudenFamilyLabel(family);
  const act = row.setCode?.trim() ? shippudenSetLabel(row.setCode) : "";
  const label = name
    ? `${reference} — ${name}`
    : act
      ? `${reference} · ${act}`
      : reference;
  return {
    printKey: row.printKey,
    // Display type (忍伝 / 術伝 / …), not Latin disk folder.
    set: setDisplay,
    card: diskCard,
    lang,
    artUrl,
    ...(thumbFile
      ? {
          thumbUrl: narutoShippudenAssetsCardUrl(
            family,
            diskCard,
            lang,
            thumbFile,
          ),
        }
      : {}),
    hasFoil: false,
    label,
    ...(name ? { name } : {}),
    ...(row.rarity?.trim() ? { rarity: row.rarity.trim() } : {}),
    missingArt: !artUrl,
    languageSpecific: true,
    kind: "face",
  };
}

export function buildShippudenCatalogueBrowseRows(): CatalogueCardRow[] | null {
  const mtimeMs = sqliteMtimeMs();
  if (cache && cache.mtimeMs === mtimeMs) return cache.rows;

  const index = createLocalPrintsIndex(NARUTO_SHIPPUDEN_PACK_ID);
  if (!index.hasIdentityCorpus()) return null;

  const byKeyLang = new Map<string, CatalogueCardRow>();
  for (const row of index.listRowsForLanguage("ja")) {
    const card = rowToCatalogueCard(row);
    byKeyLang.set(`${card.printKey}\0${card.lang}`, card);
  }
  const rows = [...byKeyLang.values()].sort((a, b) => {
    const setCmp = a.set.localeCompare(b.set, "ja");
    if (setCmp !== 0) return setCmp;
    const cardCmp = a.card.localeCompare(b.card, undefined, { numeric: true });
    if (cardCmp !== 0) return cardCmp;
    return a.lang.localeCompare(b.lang);
  });
  cache = { mtimeMs, rows };
  return rows;
}

export function clearShippudenCatalogueBrowseCache(): void {
  cache = null;
}
