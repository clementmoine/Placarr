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
  narutoAssetsCardUrl,
  narutoCardPathFromCollector,
} from "@/providers/narutoccg/narutoCardPath";
import {
  assetsPackBackUrl,
  assetsSetBackUrl,
  packCardsIndexPath,
} from "@/lib/packPaths";
import {
  catalogueCorpusPack,
  cataloguePackInfo,
  type CataloguePackId,
} from "@/lib/admin/cataloguePacks";
import type { CatalogueCardRow } from "@/lib/admin/catalogueCardsTypes";
import {
  canonicalizeNarutoPrintKey,
  compareNarutoCollectors,
  compareNarutoLangs,
  formatNarutoReference,
  narutoCollectorNumberKey,
} from "@/providers/narutoccg/collectorIdentity";
import { foldNarutoCardsIndex } from "@/providers/narutoccg/foldNarutoIndex";
import {
  orientationFromIndexSlot,
  printIsLandscapeCard,
} from "@/lib/text/artFaceOrientation";
import { resolveCatalogueFace } from "@/lib/admin/catalogueFacePick";
import {
  isLocaleSpecificFace,
  loadLocaleSpecificFaces,
} from "@/lib/admin/localeSpecificFaces";

export type { CatalogueCardRow } from "@/lib/admin/catalogueCardsTypes";

const NARUTO_UNIFIED_PACKS: readonly CataloguePackId[] = ["naruto/carddass"];

/** `ni024` / `n024` / `TE-030-cdf` → `ni:0024` / `n:0024` / `te:0030`. */
export function catalogueCollectorKey(card: string): string {
  return narutoCollectorNumberKey(card) ?? card.trim().toLowerCase();
}

export function compareNarutoCatalogueRows(
  a: CatalogueCardRow,
  b: CatalogueCardRow,
): number {
  const byCard = compareNarutoCollectors(a.card, b.card);
  if (byCard !== 0) return byCard;
  const byLang = compareNarutoLangs(a.lang, b.lang);
  if (byLang !== 0) return byLang;
  return a.printKey.localeCompare(b.printKey);
}

/** FR / EN / IT / JP faces of the same number sit together; series is not the axis. */
export function mergeNarutoCatalogueFaces(
  ...groups: readonly CatalogueCardRow[][]
): CatalogueCardRow[] {
  return groups.flat().sort(compareNarutoCatalogueRows);
}

function isNarutoUnifiedPack(pack: CataloguePackId): boolean {
  return NARUTO_UNIFIED_PACKS.includes(pack);
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
  const naruto = narutoCardPathFromCollector(id.card, id.lang);
  if (naruto) {
    return narutoAssetsCardUrl(catalogueCorpusPack(pack), naruto, file);
  }
  return assetsCardUrl(catalogueCorpusPack(pack), id, file);
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

/** Preferred-lang name on the tile; the other locale stays searchable. */
function catalogueNames(
  entry: CardsIndexEntry,
  files: CardsIndexLangFiles | undefined,
): { name?: string; aka?: string[]; label: string } {
  const preferred = files?.name?.trim() || entry.name?.trim() || undefined;
  const aka = [
    ...new Set(
      [
        entry.name?.trim(),
        ...Object.values(entry.langs).map((langFiles) =>
          langFiles.name?.trim(),
        ),
      ].filter((n): n is string => Boolean(n && n !== preferred)),
    ),
  ];
  const printed = narutoCollectorNumberKey(entry.card)
    ? formatNarutoReference(entry.set, entry.card)
    : `${entry.set} · ${entry.card}`;
  const label = preferred ? `${printed} — ${preferred}` : printed;
  return {
    ...(preferred ? { name: preferred } : {}),
    ...(aka.length ? { aka } : {}),
    label,
  };
}

function thumbFile(files: CardsIndexLangFiles): string | null {
  return files.thumb ?? null;
}

function backFile(files: CardsIndexLangFiles): string | null {
  return files.back?.trim() || null;
}

function indexMtimeMs(pack: string): number {
  try {
    return statSync(packCardsIndexPath(catalogueCorpusPack(pack))).mtimeMs;
  } catch {
    return 0;
  }
}

function loadIndex(pack: CataloguePackId): CardsIndexV1 {
  const corpus = catalogueCorpusPack(pack);
  try {
    const raw = JSON.parse(
      readFileSync(packCardsIndexPath(corpus), "utf8"),
    ) as unknown;
    if (isCardsIndexV1(raw)) return raw;
  } catch {
    /* missing / invalid */
  }
  return emptyCardsIndex(corpus);
}

function localeSlots(
  entry: CardsIndexEntry,
  preferLang: string | undefined,
  expand: boolean,
  catalogueLocales?: readonly string[],
): Array<{ lang: string; files: CardsIndexLangFiles }> {
  const langs = Object.entries(entry.langs);
  if (langs.length === 0) {
    return [{ lang: preferLang ?? "fr", files: {} }];
  }
  if (!expand) {
    const picked = pickLang(entry, preferLang);
    return picked ? [picked] : [{ lang: preferLang ?? "fr", files: {} }];
  }
  if (catalogueLocales?.length) {
    const byLang = new Map(
      langs.map(([lang, files]) => [lang, files ?? {}] as const),
    );
    return catalogueLocales.map((lang) => ({
      lang,
      files: byLang.get(lang) ?? {},
    }));
  }
  return langs
    .map(([lang, files]) => ({ lang, files: files ?? {} }))
    .sort((a, b) => compareNarutoLangs(a.lang, b.lang));
}

function donorMapKey(card: string, lang: string): string {
  return `${catalogueCollectorKey(card)}\0${lang.toLowerCase()}`;
}

function catalogueRowScore(row: CatalogueCardRow): number {
  let score = 0;
  if (row.printed !== false) score += 20;
  if (row.artUrl && !row.missingArt && !row.artFallbackFrom) score += 10;
  if (!row.artFallbackFrom) score += 3;
  if (row.name) score += 1;
  return score;
}

/**
 * One tile per printed identity + locale. An unprinted stub of NI-086 must
 * not sit beside the real FR face just because the printKey padding differs.
 */
function collapseNarutoIdentityRows(
  rows: CatalogueCardRow[],
): CatalogueCardRow[] {
  const groups = new Map<string, CatalogueCardRow[]>();
  const passthrough: CatalogueCardRow[] = [];
  for (const row of rows) {
    if (row.kind && row.kind !== "face") {
      passthrough.push(row);
      continue;
    }
    const identity = canonicalizeNarutoPrintKey(row.printKey);
    const key = `${identity}\0${row.lang.toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const collapsed: CatalogueCardRow[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      collapsed.push(list[0]!);
      continue;
    }
    list.sort((a, b) => catalogueRowScore(b) - catalogueRowScore(a));
    collapsed.push(list[0]!);
  }
  return [...passthrough, ...collapsed].sort(compareNarutoCatalogueRows);
}

/** Build browse rows from an in-memory index (also used by unit tests). */
export function buildCatalogueCardRows(
  pack: CataloguePackId,
  index: CardsIndexV1,
  preferLang?: string,
): CatalogueCardRow[] {
  const packInfo = cataloguePackInfo(pack);
  const allowFallback = packInfo?.sameNumberArtFallback === true;
  const expandLocales =
    packInfo?.expandLocales === true || isNarutoUnifiedPack(pack);
  const catalogueLocales = packInfo?.catalogueLocales;
  const corpusPack = catalogueCorpusPack(pack);
  const bestFaceAcrossLocales =
    packInfo?.localeArt?.bestFaceAcrossLocales === true;
  const localeSpecificFaces = bestFaceAcrossLocales
    ? loadLocaleSpecificFaces(corpusPack)
    : null;
  const source = isNarutoUnifiedPack(pack) ? foldNarutoCardsIndex(index) : index;

  const donorsByNumber = new Map<string, ArtDonor>();
  if (allowFallback) {
    for (const [printKey, entry] of Object.entries(source.cards)) {
      for (const slot of localeSlots(entry, preferLang, true, catalogueLocales)) {
        const file = artFile(slot.files);
        if (!file) continue;
        const key = donorMapKey(entry.card, slot.lang);
        const thumb = thumbFile(slot.files) ?? undefined;
        const candidate: ArtDonor = {
          printKey,
          set: entry.set,
          card: entry.card,
          lang: slot.lang,
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
  }

  const rows: CatalogueCardRow[] = [];
  for (const [printKey, entry] of Object.entries(source.cards)) {
    const hasFoil = entryHasFoil(entry);
    for (const slot of localeSlots(
      entry,
      preferLang,
      expandLocales,
      catalogueLocales,
    )) {
      const lang = slot.lang;
      const languageSpecific = isLocaleSpecificFace(
        localeSpecificFaces,
        entry.set,
        entry.card,
      );
      const face = resolveCatalogueFace({
        entry,
        tileLang: lang,
        tileFiles: slot.files,
        catalogueLocales,
        languageSpecific,
        bestFaceAcrossLocales,
      });
      const file = face.file;
      const names = catalogueNames(entry, slot.files);
      const orient = orientationFromIndexSlot(entry, face.files);
      const landscapePrint = printIsLandscapeCard(entry);
      const artLocaleFrom =
        file && face.artLang.toLowerCase() !== lang.toLowerCase()
          ? face.artLang
          : undefined;
      const identity = {
        printKey,
        set: entry.set,
        card: entry.card,
        hasFoil,
        label: names.label,
        ...(names.name ? { name: names.name } : {}),
        ...(names.aka ? { aka: names.aka } : {}),
        ...(entry.rarity ? { rarity: entry.rarity } : {}),
        ...(slot.files.printed === false ? { printed: false } : {}),
        ...(orient.landscapeFace ? { landscapeFace: true } : {}),
        ...(orient.faceQuarterTurns
          ? { faceQuarterTurns: orient.faceQuarterTurns }
          : {}),
        ...(landscapePrint ? { landscapePrint: true } : {}),
      };

      if (!file) {
        const remote = remoteArtUrl(slot.files);
        if (remote) {
          rows.push({
            ...identity,
            lang,
            artUrl: remote,
          });
          continue;
        }
        const diskId = {
          set: entry.set,
          lang,
          card: entry.card,
        };
        const back = backFile(slot.files);
        if (back) {
          rows.push({
            ...identity,
            lang,
            artUrl: packFaceAssetUrl(pack, diskId, back),
            versoOnly: true,
          });
          continue;
        }
        const donor = allowFallback
          ? donorsByNumber.get(donorMapKey(entry.card, lang))
          : undefined;
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
            ...identity,
            lang,
            artUrl,
            ...(thumbUrl ? { thumbUrl } : {}),
            artFallbackFrom: donor.printKey,
          });
          continue;
        }
        rows.push({
          ...identity,
          lang,
          artUrl: "",
          missingArt: true,
        });
        continue;
      }
      const diskId = {
        set: entry.set,
        lang: face.artLang,
        card: entry.card,
      };
      const thumb = face.thumb;
      const artUrl = packFaceAssetUrl(pack, diskId, file);
      const thumbUrl = thumb
        ? packFaceAssetUrl(pack, diskId, thumb)
        : undefined;
      rows.push({
        ...identity,
        lang,
        artUrl,
        ...(thumbUrl ? { thumbUrl } : {}),
        ...(artLocaleFrom ? { artLocaleFrom } : {}),
      });
    }
  }
  if (expandLocales && isNarutoUnifiedPack(pack)) {
    return collapseNarutoIdentityRows(rows);
  }
  if (expandLocales) {
    rows.sort((a, b) => {
      const setCmp = a.set.localeCompare(b.set, undefined, { numeric: true });
      if (setCmp !== 0) return setCmp;
      const cardCmp = a.card.localeCompare(b.card, undefined, {
        numeric: true,
      });
      if (cardCmp !== 0) return cardCmp;
      return compareNarutoLangs(a.lang, b.lang);
    });
    return rows;
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
export type CatalogueBackTile = { url: string; lang: string; key?: string };

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
    tile.key ?? (tile.lang === "—" ? "" : `-${tile.lang}`);
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

  const corpus = catalogueCorpusPack(pack);
  const packBackUrl = distinct((lang) => assetsPackBackUrl(corpus, lang));
  const setBackUrls = new Map<string, CatalogueBackTile[]>();
  for (const set of new Set(faceRows.map((r) => r.set))) {
    const tiles = distinct((lang) => assetsSetBackUrl(corpus, set, lang));
    if (tiles.length) setBackUrls.set(set, tiles);
  }
  return mergeCatalogueBackRows({
    pack,
    faceRows,
    packBackUrl,
    setBackUrls,
  });
}

function cachedFaces(
  pack: CataloguePackId,
  preferLang?: string,
): CatalogueCardRow[] {
  const mtimeMs = indexMtimeMs(pack);
  const cacheKey = `${pack}|${preferLang ?? ""}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.mtimeMs === mtimeMs) return hit.rows;
  const faces = buildCatalogueCardRows(pack, loadIndex(pack), preferLang);
  cache.set(cacheKey, { mtimeMs, rows: faces });
  return faces;
}

function withNarutoUnifiedBacks(faces: CatalogueCardRow[]): CatalogueCardRow[] {
  const langs = [
    ...new Set(["fr", "en", "it", "ja", ...faces.map((row) => row.lang)]),
  ].filter(Boolean);
  const tiles: CatalogueBackTile[] = [];
  const seen = new Set<string>();
  const corpus = catalogueCorpusPack("naruto/carddass");
  const resolve = (lang: string | undefined) => assetsPackBackUrl(corpus, lang);
  for (const lang of langs) {
    const url = resolve(lang);
    if (url && !seen.has(url)) {
      seen.add(url);
      tiles.push({ url, lang, key: `-${lang}` });
    }
  }
  // `back.webp` is the FR alias for flip — not a fifth catalogue tile.
  return mergeCatalogueBackRows({
    pack: "naruto/carddass",
    faceRows: faces,
    packBackUrl: tiles,
    setBackUrls: {},
  });
}

function rowsForPack(
  pack: CataloguePackId,
  preferLang?: string,
): CatalogueCardRow[] {
  if (isNarutoUnifiedPack(pack)) {
    return withNarutoUnifiedBacks(cachedFaces(pack, preferLang));
  }
  const faces = cachedFaces(pack, preferLang);
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
  /**
   * `preferred` — one tile per print in `preferLang` (clean grid).
   * `all` — every locale in `catalogueLocales` (Ninja Ranks audit).
   */
  locales?: "all" | "preferred";
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
  const packInfo = cataloguePackInfo(input.pack);
  const localeMode = input.locales ?? "preferred";
  const preferLang = input.preferLang?.trim().toLowerCase();
  if (
    localeMode === "preferred" &&
    preferLang &&
    packInfo?.catalogueLocales?.length
  ) {
    rows = rows.filter(
      (row) =>
        row.kind === "pack-back" ||
        row.kind === "set-back" ||
        row.lang.toLowerCase() === preferLang,
    );
  }
  if (input.foilOnly) {
    rows = rows.filter((row) => row.hasFoil);
  }
  const q = input.q?.trim().toLowerCase();
  if (q) {
    const qKey = narutoCollectorNumberKey(q);
    rows = rows.filter((row) => {
      if (
        row.printKey.toLowerCase().includes(q) ||
        row.set.toLowerCase().includes(q) ||
        row.card.toLowerCase().includes(q) ||
        row.label.toLowerCase().includes(q) ||
        row.aka?.some((alias) => alias.toLowerCase().includes(q))
      ) {
        return true;
      }
      return qKey != null && qKey === catalogueCollectorKey(row.card);
    });
  }
  return {
    pack: input.pack,
    total: rows.length,
    offset,
    limit,
    cards: rows.slice(offset, offset + limit),
  };
}
