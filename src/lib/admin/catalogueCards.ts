/**
 * Paginated browse of local `data/<pack>/cards-index.json` for the admin Catalogue.
 * Server / scripts only (fs). Reads the file directly so syncs invalidate via mtime.
 */
import { readFileSync, statSync } from "node:fs";

import {
  emptyCardsIndex,
  isCardsIndexV1,
  type CardsIndexEntry,
  type CardsIndexLangFiles,
  type CardsIndexV1,
} from "@/effects/cardsIndex";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import { packCardsIndexPath } from "@/lib/packPaths";
import type { CataloguePackId } from "@/lib/admin/cataloguePacks";
import type { CatalogueCardRow } from "@/lib/admin/catalogueCardsTypes";

export type { CatalogueCardRow } from "@/lib/admin/catalogueCardsTypes";

type PackCache = {
  mtimeMs: number;
  rows: CatalogueCardRow[];
};

const cache = new Map<string, PackCache>();

export function resetCatalogueCardsCache(): void {
  cache.clear();
}

/** Card-local face file under `cards/{set}/{lang}/{card}/`. */
export function packFaceAssetUrl(
  pack: CataloguePackId,
  id: { set: string; lang: string; card: string },
  file: string,
): string {
  return assetsCardUrl(pack, id, file);
}

export function langFilesHaveFoil(files: CardsIndexLangFiles): boolean {
  if (files.mask || files.etch || files.varnishMask || files.secondVarnishMask) {
    return true;
  }
  if (!files.variants) return false;
  for (const variant of Object.values(files.variants)) {
    if (variant.mask || variant.etch || variant.foil) return true;
  }
  return false;
}

export function entryHasFoil(entry: CardsIndexEntry): boolean {
  for (const files of Object.values(entry.langs)) {
    if (langFilesHaveFoil(files)) return true;
  }
  return false;
}

function pickLang(
  entry: CardsIndexEntry,
  prefer: string | undefined,
): { lang: string; files: CardsIndexLangFiles } | null {
  const langs = Object.entries(entry.langs);
  if (langs.length === 0) return null;
  if (prefer) {
    const hit = langs.find(([lang]) => lang.toLowerCase() === prefer);
    if (hit) return { lang: hit[0], files: hit[1]! };
  }
  const fr = langs.find(([lang]) => lang.toLowerCase() === "fr");
  if (fr) return { lang: fr[0], files: fr[1]! };
  const en = langs.find(([lang]) => lang.toLowerCase() === "en");
  if (en) return { lang: en[0], files: en[1]! };
  const first = langs[0]!;
  return { lang: first[0], files: first[1]! };
}

function artFile(files: CardsIndexLangFiles): string | null {
  // Prefer errata / corrected face when both filenames are somehow listed.
  if (files.art && /\.corrected\./i.test(files.art)) return files.art;
  if (files.art) return files.art;
  return files.thumb ?? null;
}

function thumbFile(files: CardsIndexLangFiles): string | null {
  return files.thumb ?? null;
}

function indexMtimeMs(pack: string): number {
  try {
    return statSync(packCardsIndexPath(pack)).mtimeMs;
  } catch {
    return 0;
  }
}

function loadIndex(pack: CataloguePackId): CardsIndexV1 {
  try {
    const raw = JSON.parse(
      readFileSync(packCardsIndexPath(pack), "utf8"),
    ) as unknown;
    if (isCardsIndexV1(raw)) return raw;
  } catch {
    /* missing / invalid */
  }
  return emptyCardsIndex(pack);
}

function buildRows(
  pack: CataloguePackId,
  index: CardsIndexV1,
  preferLang?: string,
): CatalogueCardRow[] {
  const rows: CatalogueCardRow[] = [];
  for (const [printKey, entry] of Object.entries(index.cards)) {
    const picked = pickLang(entry, preferLang);
    if (!picked) continue;
    const file = artFile(picked.files);
    if (!file) continue;
    const thumb = thumbFile(picked.files);
    const diskId = {
      set: entry.set,
      lang: picked.lang,
      card: entry.card,
    };
    const hasFoil = entryHasFoil(entry);
    const artUrl = packFaceAssetUrl(pack, diskId, file);
    const thumbUrl = thumb ? packFaceAssetUrl(pack, diskId, thumb) : undefined;
    rows.push({
      printKey,
      set: entry.set,
      card: entry.card,
      lang: picked.lang,
      artUrl,
      ...(thumbUrl ? { thumbUrl } : {}),
      hasFoil,
      label: entry.name
        ? `${entry.set} · ${entry.card} — ${entry.name}`
        : `${entry.set} · ${entry.card}`,
      ...(entry.rarity ? { rarity: entry.rarity } : {}),
      ...(entry.name ? { name: entry.name } : {}),
    });
  }
  rows.sort((a, b) => {
    const setCmp = a.set.localeCompare(b.set, undefined, { numeric: true });
    if (setCmp !== 0) return setCmp;
    return a.card.localeCompare(b.card, undefined, { numeric: true });
  });
  return rows;
}

function rowsForPack(
  pack: CataloguePackId,
  preferLang?: string,
): CatalogueCardRow[] {
  const mtimeMs = indexMtimeMs(pack);
  const cacheKey = `${pack}|${preferLang ?? ""}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.mtimeMs === mtimeMs) return hit.rows;
  const rows = buildRows(pack, loadIndex(pack), preferLang);
  cache.set(cacheKey, { mtimeMs, rows });
  return rows;
}

export type ListCatalogueCardsInput = {
  pack: CataloguePackId;
  /** When true, only rows with foil-related assets. */
  foilOnly?: boolean;
  offset?: number;
  limit?: number;
  /** Substring match on printKey / set / card / label. */
  q?: string;
  preferLang?: string;
};

export type ListCatalogueCardsResult = {
  pack: CataloguePackId;
  total: number;
  offset: number;
  limit: number;
  cards: CatalogueCardRow[];
};

export function listCatalogueCards(
  input: ListCatalogueCardsInput,
): ListCatalogueCardsResult {
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.min(200, Math.max(1, Math.floor(input.limit ?? 48)));
  let rows = rowsForPack(input.pack, input.preferLang);
  if (input.foilOnly) {
    rows = rows.filter((row) => row.hasFoil);
  }
  const q = input.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (row) =>
        row.printKey.toLowerCase().includes(q) ||
        row.set.toLowerCase().includes(q) ||
        row.card.toLowerCase().includes(q) ||
        row.label.toLowerCase().includes(q),
    );
  }
  return {
    pack: input.pack,
    total: rows.length,
    offset,
    limit,
    cards: rows.slice(offset, offset + limit),
  };
}
