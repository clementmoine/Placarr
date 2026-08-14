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
import {
  assetsPackBackUrl,
  assetsSetBackUrl,
  packCardsIndexPath,
} from "@/lib/packPaths";
import {
  cataloguePackInfo,
  type CataloguePackId,
} from "@/lib/admin/cataloguePacks";
import type { CatalogueCardRow } from "@/lib/admin/catalogueCardsTypes";

export type { CatalogueCardRow } from "@/lib/admin/catalogueCardsTypes";

/** `ni024`, `te030-cdf`, `TE-030` → `ni024` / `te030` for same-number art fallback. */
export function catalogueCollectorKey(card: string): string {
  const raw = card.trim().toLowerCase();
  const m = /^((?:ni|te|ta|cl|pr)[\-]?\d{1,4})(?:-.*)?$/i.exec(raw);
  if (!m) return raw;
  return m[1]!.replace(/-/g, "");
}

type ArtDonor = {
  printKey: string;
  set: string;
  card: string;
  lang: string;
  file: string;
  thumb?: string;
};

function donorScore(set: string, file: string): number {
  let score = 0;
  if (set.toLowerCase() !== "promo") score += 100;
  if (/\.reconstructed\./i.test(file)) score += 30;
  else if (/\.corrected\./i.test(file)) score += 20;
  return score;
}

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
  if (
    files.mask ||
    files.etch ||
    files.varnishMask ||
    files.secondVarnishMask
  ) {
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

function remoteArtUrl(files: CardsIndexLangFiles): string | null {
  const url = files.artUrl?.trim();
  if (url && /^https?:\/\//i.test(url)) return url;
  return null;
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

/** Build browse rows from an in-memory index (also used by unit tests). */
export function buildCatalogueCardRows(
  pack: CataloguePackId,
  index: CardsIndexV1,
  preferLang?: string,
): CatalogueCardRow[] {
  const allowFallback = cataloguePackInfo(pack)?.sameNumberArtFallback === true;

  const donorsByNumber = new Map<string, ArtDonor>();
  if (allowFallback) {
    for (const [printKey, entry] of Object.entries(index.cards)) {
      const picked = pickLang(entry, preferLang);
      const file = picked ? artFile(picked.files) : null;
      if (!picked || !file) continue;
      const key = catalogueCollectorKey(entry.card);
      const thumb = thumbFile(picked.files) ?? undefined;
      const candidate: ArtDonor = {
        printKey,
        set: entry.set,
        card: entry.card,
        lang: picked.lang,
        file,
        ...(thumb ? { thumb } : {}),
      };
      const prev = donorsByNumber.get(key);
      if (
        !prev ||
        donorScore(candidate.set, candidate.file) >
          donorScore(prev.set, prev.file)
      ) {
        donorsByNumber.set(key, candidate);
      }
    }
  }

  const rows: CatalogueCardRow[] = [];
  for (const [printKey, entry] of Object.entries(index.cards)) {
    const picked = pickLang(entry, preferLang);
    const file = picked ? artFile(picked.files) : null;
    const lang = picked?.lang ?? preferLang ?? "fr";
    const hasFoil = entryHasFoil(entry);
    const label = entry.name
      ? `${entry.set} · ${entry.card} — ${entry.name}`
      : `${entry.set} · ${entry.card}`;

    if (!file) {
      const remote = picked ? remoteArtUrl(picked.files) : null;
      if (remote) {
        rows.push({
          printKey,
          set: entry.set,
          card: entry.card,
          lang,
          artUrl: remote,
          hasFoil,
          label,
          ...(entry.rarity ? { rarity: entry.rarity } : {}),
          ...(entry.name ? { name: entry.name } : {}),
        });
        continue;
      }
      const donor = allowFallback
        ? donorsByNumber.get(catalogueCollectorKey(entry.card))
        : undefined;
      // Don't point a stub at itself (no art) or another empty print.
      if (donor && donor.printKey !== printKey) {
        const diskId = {
          set: donor.set,
          lang: donor.lang,
          card: donor.card,
        };
        const artUrl = packFaceAssetUrl(pack, diskId, donor.file);
        const thumbUrl = donor.thumb
          ? packFaceAssetUrl(pack, diskId, donor.thumb)
          : undefined;
        rows.push({
          printKey,
          set: entry.set,
          card: entry.card,
          lang: donor.lang,
          artUrl,
          ...(thumbUrl ? { thumbUrl } : {}),
          hasFoil,
          label,
          artFallbackFrom: donor.printKey,
          ...(entry.rarity ? { rarity: entry.rarity } : {}),
          ...(entry.name ? { name: entry.name } : {}),
        });
        continue;
      }
      rows.push({
        printKey,
        set: entry.set,
        card: entry.card,
        lang,
        artUrl: "",
        hasFoil,
        label,
        missingArt: true,
        ...(entry.rarity ? { rarity: entry.rarity } : {}),
        ...(entry.name ? { name: entry.name } : {}),
      });
      continue;
    }
    const diskId = {
      set: entry.set,
      lang,
      card: entry.card,
    };
    const thumb = picked ? thumbFile(picked.files) : null;
    const artUrl = packFaceAssetUrl(pack, diskId, file);
    const thumbUrl = thumb ? packFaceAssetUrl(pack, diskId, thumb) : undefined;
    rows.push({
      printKey,
      set: entry.set,
      card: entry.card,
      lang,
      artUrl,
      ...(thumbUrl ? { thumbUrl } : {}),
      hasFoil,
      label,
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

/**
 * Insert pack-common and per-set verso tiles so backs are browsable like faces.
 * Pack back leads the grid; each set back leads its set group.
 */
/**
 * One verso tile. `lang` is `"—"` for a back shared by every locale of the
 * pack; it carries a code only when that print run has its own verso.
 */
export type CatalogueBackTile = { url: string; lang: string };

/** Accept a bare URL (one shared back) or an explicit per-language list. */
type BackInput = string | null | undefined | readonly CatalogueBackTile[];

function backTiles(input: BackInput): CatalogueBackTile[] {
  if (!input) return [];
  if (typeof input === "string") return [{ url: input, lang: "—" }];
  return [...input];
}

export function mergeCatalogueBackRows(input: {
  pack: CataloguePackId;
  faceRows: CatalogueCardRow[];
  packBackUrl?: BackInput;
  setBackUrls?:
    | ReadonlyMap<string, BackInput>
    | Record<string, Exclude<BackInput, undefined>>;
}): CatalogueCardRow[] {
  const setBackMap =
    input.setBackUrls instanceof Map
      ? input.setBackUrls
      : new Map<string, BackInput>(Object.entries(input.setBackUrls ?? {}));

  /** Suffix keeps print keys unique when a pack has several versos. */
  const suffix = (tile: CatalogueBackTile) =>
    tile.lang === "—" ? "" : `-${tile.lang}`;
  const suffixLabel = (tile: CatalogueBackTile) =>
    tile.lang === "—" ? "" : ` · ${tile.lang.toUpperCase()}`;

  const out: CatalogueCardRow[] = [];
  for (const tile of backTiles(input.packBackUrl)) {
    out.push({
      printKey: `${input.pack}:__pack-back${suffix(tile)}__`,
      set: "",
      card: "back",
      lang: tile.lang,
      artUrl: tile.url,
      hasFoil: false,
      label: `Dos · pack${suffixLabel(tile)}`,
      kind: "pack-back",
    });
  }

  let currentSet: string | null = null;
  for (const row of input.faceRows) {
    if (row.set !== currentSet) {
      currentSet = row.set;
      for (const tile of backTiles(setBackMap.get(row.set))) {
        out.push({
          printKey: `${input.pack}:__set-back-${row.set}${suffix(tile)}__`,
          set: row.set,
          card: "back",
          lang: tile.lang,
          artUrl: tile.url,
          hasFoil: false,
          label: `Dos · ${row.set}${suffixLabel(tile)}`,
          kind: "set-back",
        });
      }
    }
    out.push(row);
  }
  return out;
}

/** Resolve on-disk backs and prepend them to face rows. */
export function withCatalogueBackRows(
  pack: CataloguePackId,
  faceRows: CatalogueCardRow[],
): CatalogueCardRow[] {
  // Resolve the verso once per locale on show, then keep only the distinct
  // files: locales that share the common `back.webp` collapse to a single
  // tile, and a run with its own `back.<lang>.webp` gets its own.
  const langs = [...new Set(faceRows.map((r) => r.lang).filter(Boolean))];
  const distinct = (
    resolve: (lang: string | undefined) => string | null,
  ): CatalogueBackTile[] => {
    const shared = resolve(undefined);
    const byUrl = new Map<string, string>();
    if (shared) byUrl.set(shared, "—");
    for (const lang of langs) {
      const url = resolve(lang);
      if (url && !byUrl.has(url)) byUrl.set(url, lang);
    }
    return [...byUrl].map(([url, lang]) => ({ url, lang }));
  };

  const packBackUrl = distinct((lang) => assetsPackBackUrl(pack, lang));
  const setBackUrls = new Map<string, CatalogueBackTile[]>();
  for (const set of new Set(faceRows.map((r) => r.set))) {
    const tiles = distinct((lang) => assetsSetBackUrl(pack, set, lang));
    if (tiles.length) setBackUrls.set(set, tiles);
  }
  return mergeCatalogueBackRows({
    pack,
    faceRows,
    packBackUrl,
    setBackUrls,
  });
}

function rowsForPack(
  pack: CataloguePackId,
  preferLang?: string,
): CatalogueCardRow[] {
  const mtimeMs = indexMtimeMs(pack);
  const cacheKey = `${pack}|${preferLang ?? ""}`;
  const hit = cache.get(cacheKey);
  let faces: CatalogueCardRow[];
  if (hit && hit.mtimeMs === mtimeMs) {
    faces = hit.rows;
  } else {
    faces = buildCatalogueCardRows(pack, loadIndex(pack), preferLang);
    cache.set(cacheKey, { mtimeMs, rows: faces });
  }
  // Backs are cheap existsSync lookups; keep them outside the index mtime cache
  // so installing `cards/back.webp` shows up without a re-sync.
  return withCatalogueBackRows(pack, faces);
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
