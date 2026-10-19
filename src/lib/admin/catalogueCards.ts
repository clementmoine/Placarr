/**
 * Paginated browse of local catalogue corpora for the admin Catalogue.
 * Server / scripts only (fs). Identity = sqlite via
 * {@link tryBuildIdentityCatalogueRows} — no `cards-index.json` fallback.
 */
import type {
  CardsIndexEntry,
  CardsIndexLangFiles,
  CardsIndexV1,
} from "@/effects/cardsIndex";
import {
  assetsCardUrl,
  assetsPrintFaceUrl,
  cardDiskIdFromPrintKey,
} from "@/lib/packAssetUrls";
import {
  assetsPackBackUrl,
  assetsPackTierBackUrl,
  assetsSetBackUrl,
  listPackTierBackSlugs,
} from "@/lib/packPaths";
import { tryBuildIdentityCatalogueRows, clearIdentityCatalogueBrowseCache } from "@/lib/admin/catalogueIdentityBrowse";
import {
  catalogueCorpusPack,
  cataloguePackInfo,
  type CataloguePackId,
} from "@/lib/admin/cataloguePacks";
import {
  canonicalizeNarutoPrintKey,
  compareNarutoCollectors,
  compareNarutoLangs,
  formatNarutoReference,
  isJpOnlyNarutoArtwork,
  isNarutoCatalogueSetCode,
  isNarutoFrUnpublishedHtmlNumber,
  isNarutoJapaneseVolumeSet,
  narutoCollectorKey,
  narutoCollectorNumberKey,
  parseNarutoCollector,
} from "@/providers/naruto/narutocarddass/identity";
import { foldNarutoCardsIndex } from "@/providers/naruto/narutocarddass/pipeline";
import { narutoCatalogueLineForCard } from "@/providers/naruto/narutocarddass/packs";
import { resolveNarutoPrintFace } from "@/providers/naruto/narutocarddass/printFaceResolve";
import { isNarutoS6FrPrintedNumber } from "@/providers/naruto/narutocarddass/sources/titles";
import { belongsOnNarutoPromoChecklist } from "@/providers/naruto/narutocarddass/sources/promos";
import { formatShippudenReference } from "@/providers/naruto/narutoshippuden/search";
import { printIsLandscapeCard } from "@/lib/text/artFaceOrientation";
import { orientationFromIndexSlot } from "@/lib/text/artFaceOrientationLenticular";
import { resolveCatalogueFace } from "@/lib/admin/catalogueFacePick";
import {
  entryIsLocaleSpecificFace,
  isLocaleSpecificFace,
  loadLocaleSpecificFaces,
} from "@/lib/admin/localeSpecificFaces";
import { catalogueCardPriceQuoteByPrintKey } from "@/lib/admin/catalogueCardPrices";

export { isNarutoJapaneseVolumeSet };

/** Client-safe catalogue browse row (API + UI). */
export type CatalogueCardRow = {
  printKey: string;
  set: string;
  card: string;
  lang: string;
  /** Empty when the print is catalogued without a face yet. */
  artUrl: string;
  /** When mapped (e.g. Naruto site med), prefer for grid previews. */
  thumbUrl?: string;
  hasFoil: boolean;
  label: string;
  name?: string;
  /** Other locale names, so search finds the card from either catalogue. */
  aka?: string[];
  rarity?: string;
  /** True when index has the print/name but no art/thumb file yet. */
  missingArt?: boolean;
  /** Grid preview uses `back` because no recto is catalogued for this locale. */
  versoOnly?: boolean;
  /**
   * When `artUrl` comes from another print of the same collector number
   * (e.g. promo stub → retail S1 face) until official art exists.
   */
  artFallbackFrom?: string;
  /**
   * When `artUrl` comes from another locale of the same print (neutral recto
   * borrowed across `catalogueLocales`). Verso stays on `lang`.
   */
  artLocaleFrom?: string;
  /**
   * Recto carries locale-printed text (or the pack has no cross-locale borrow).
   * Preferred lang filter keeps these only for matching `lang`; neutral faces
   * stay visible under every language.
   */
  languageSpecific?: boolean;
  /** When `name` was copied from another locale (approximate title). */
  nameLocaleFrom?: string;
  /** Non-attested title pipeline, e.g. slug parse. */
  nameSource?: string;
  /** Synthetic pack/set back tiles in the catalogue grid. */
  kind?: "face" | "pack-back" | "set-back";
  /**
   * False = not collectible cardboard (digital-only, never printed, cancelled).
   * Admin keeps the tile; checklist / search hide it unless includeUnprinted.
   */
  printed?: boolean;
  /** Native landscape scan — wider tile, no pixel rotation. */
  landscapeFace?: boolean;
  /** Portrait scan of a landscape print — rotate 90° in the frame. */
  faceQuarterTurns?: 0 | 1 | 2 | 3;
  /** Any locale art for this print is wider than tall. */
  landscapePrint?: boolean;
  /** Kayou HR/BP sprite sheet — cols×rows. */
  lenticularGrid?: { cols: number; rows: number };
  /** Cardmarket / *cards.fr EUR cents when a reference pricer knows this print. */
  priceCents?: number | null;
  /**
   * Thirty-day Cardmarket move (EUR cents, signed) when the *cards.fr dump
   * quotes one — null = unknown, not « flat ».
   */
  priceDeltaCents?: number | null;
  /** Symfony item id on the *cards.fr shop tile, when the dump carries it. */
  shopItemId?: string | null;
  /**
   * Checklist appearances collapsed into this browse tile (set-scoped
   * printKeys). Sealed still uses the full membership list in sqlite.
   */
  appearanceSets?: string[];
};

const NARUTO_UNIFIED_PACKS: readonly CataloguePackId[] = ["naruto/carddass"];

/** Disk folder under `cards/{lang}/{set}/` — includes printKey grouping (`20-p1`). */
export function catalogueDiskCard(
  pack: CataloguePackId,
  printKey: string,
  entry: Pick<CardsIndexEntry, "card">,
): string {
  // Collector folders already embed the prefix (`ni0001-ps`); don't double up.
  if (cataloguePackInfo(pack)?.collectorCardFolder) return entry.card;
  /*
    Prefer the index folder when it already embeds more than parsePrintKey's
    bare number. 疾風伝 stores `gaku0038` on disk / in `entry.card`, but the
    printKey is `naruto:gaku-0038` → parse → `0038`, which 404s
    (`…/ja/0038/` vs `…/ja/gaku0038/`). Lorcana `1-c1` matches parse and stays.
  */
  const fromEntry = entry.card?.trim();
  const fromKey = cardDiskIdFromPrintKey(printKey, "en")?.card;
  if (
    fromEntry &&
    fromKey &&
    fromEntry !== fromKey &&
    fromEntry.toLowerCase().endsWith(fromKey.toLowerCase())
  ) {
    return fromEntry;
  }
  if (fromKey) return fromKey;
  return fromEntry ?? "";
}

function langSlotHasContent(files: CardsIndexLangFiles | undefined): boolean {
  if (!files) return false;
  return Boolean(
    files.name?.trim() ||
      files.art?.trim() ||
      files.thumb?.trim() ||
      files.artUrl?.trim() ||
      files.back?.trim(),
  );
}

function pickLang(
  entry: CardsIndexEntry,
  prefer: string | undefined,
): { lang: string; files: CardsIndexLangFiles } | null {
  const langs = Object.entries(entry.langs).filter(([, files]) =>
    langSlotHasContent(files),
  );
  if (langs.length === 0) {
    // Empty shells only — keep a stub so missing-art audits still see the print.
    const all = Object.entries(entry.langs);
    if (all.length === 0) return null;
    if (prefer) {
      const hit = all.find(([lang]) => lang.toLowerCase() === prefer);
      if (hit) return { lang: hit[0], files: hit[1]! };
    }
    return { lang: all[0]![0], files: all[0]![1]! };
  }
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

/**
 * S1 manga prerelease is a French-channel alt (~10 €) — no JA/EN/IT print.
 * Stubs must not invent JA tiles (with borrowed retail art) from sibling titles.
 */
function isNarutoMangaPrerelease(entry: {
  set: string;
  card: string;
}): boolean {
  if (entry.set.toLowerCase() === "prerelease") return true;
  return (
    parseNarutoCollector(entry.card)?.grouping?.toLowerCase() === "prerelease"
  );
}

type ArtDonor = {
  printKey: string;
  set: string;
  card: string;
  lang: string;
  file: string;
  thumb?: string;
};

function donorScore(set: string, file: string, card?: string): number {
  let score = 0;
  const setLc = set.toLowerCase();
  if (setLc !== "promo" && setLc !== "prerelease") score += 100;
  /*
    Same-art reprints (prerelease / tourney / cdf) must not outrank the retail
    sheet when both somehow have a face — the grid should show the booster art.
  */
  const grouping = parseNarutoCollector(card ?? "")?.grouping?.toLowerCase();
  if (!grouping) score += 50;
  else if (
    grouping === "prerelease" ||
    grouping === "promo" ||
    grouping === "cdf"
  ) {
    score -= 20;
  }
  if (/\.reconstructed\./i.test(file)) score += 30;
  else if (/\.corrected\./i.test(file)) score += 20;
  return score;
}

/** Promo / prerelease / cdf channel — not a retail booster membership. */
function isAltChannelPrint(printKey: string, card: string): boolean {
  const set = narutoPrintKeySetCode(printKey)?.toLowerCase();
  if (set === "promo" || set === "prerelease") return true;
  const grouping = parseNarutoCollector(card)?.grouping?.toLowerCase();
  return (
    grouping === "promo" ||
    grouping === "prerelease" ||
    grouping === "cdf"
  );
}

/**
 * Promo stubs may inherit retail art; a retail tile must not show a tourney /
 * promo face (TE-107 無音殺人者 ≠ PR術-107 無音殺人術).
 * When `artBorrowFrom` is set, the donor set must appear in the tile's chain.
 */
function isNarutoRetailFamilySet(set: string): boolean {
  const s = set.toLowerCase();
  return (
    s === "ninja" ||
    s === "jutsu" ||
    s === "mission" ||
    s === "client" ||
    s === "knight" ||
    s === "character"
  );
}

/** Set folder / borrow-policy key for a tile (channel beats folded home sN). */
function narutoArtChannelSet(
  printKey: string,
  card: string,
  entrySet?: string,
): string | null {
  if (isAltChannelPrint(printKey, card)) {
    const fromKey = narutoPrintKeySetCode(printKey)?.toLowerCase();
    if (fromKey === "promo" || fromKey === "prerelease") return fromKey;
    const grouping = parseNarutoCollector(card)?.grouping?.toLowerCase();
    if (grouping === "prerelease") return "prerelease";
    if (grouping === "promo" || grouping === "cdf") return "promo";
    const fromEntry = entrySet?.toLowerCase();
    if (fromEntry === "promo" || fromEntry === "prerelease") return fromEntry;
    return "promo";
  }
  const fromKey = narutoPrintKeySetCode(printKey)?.toLowerCase();
  if (fromKey) return fromKey;
  const fromEntry = (entrySet ?? "").toLowerCase();
  // Family labels (`ninja`) are not disk sets after lang-first cutover.
  if (fromEntry && !isNarutoRetailFamilySet(fromEntry)) return fromEntry;
  return null;
}

/** Disk set segment for URLs / donors — never a retail family folder. */
function narutoDiskSetForArt(
  printKey: string,
  card: string,
  entrySet?: string,
): string {
  return (
    narutoArtChannelSet(printKey, card, entrySet) ??
    (entrySet && !isNarutoRetailFamilySet(entrySet) ? entrySet : "s1")
  );
}

function donorMatchesArtBorrowChain(
  donorSet: string,
  chain: readonly string[],
): boolean {
  const set = donorSet.toLowerCase();
  if (chain.some((s) => s.toLowerCase() === set)) return true;
  // Index rows often still label the family (`ninja`) while printKeys are bare
  // (`naruto:ni-0019`) — treat as retail for s1–s5 inheritance chains.
  if (isNarutoRetailFamilySet(set)) {
    return chain.some((s) => /^s[1-5]$/i.test(s));
  }
  return false;
}

function acceptArtDonor(
  tilePrintKey: string,
  tileCard: string,
  donor: ArtDonor,
  artBorrowFrom?: Readonly<Record<string, readonly string[]>>,
  tileSetHint?: string | null,
): boolean {
  if (donor.printKey === tilePrintKey) return false;
  /*
    Carddass NI/TE (S1–S6) ≠ Bandai USA CCG N/J (S1–S28). Same digit « 100 »
    must never share a face — different backs, different games.
  */
  if (
    narutoCatalogueLineForCard(tileCard, tileSetHint ?? undefined) !==
    narutoCatalogueLineForCard(donor.card, donor.set)
  ) {
    return false;
  }
  if (
    !isAltChannelPrint(tilePrintKey, tileCard) &&
    isAltChannelPrint(donor.printKey, donor.card)
  ) {
    return false;
  }
  if (artBorrowFrom) {
    /*
      Folded keys like `s1-ni0019-prerelease` report setCode `s1` — borrow
      policy keys off the channel (`prerelease` / `promo`), not home sN.
    */
    const tileSet =
      tileSetHint?.toLowerCase() ||
      narutoArtChannelSet(tilePrintKey, tileCard) ||
      null;
    if (!tileSet) return false;
    const chain = artBorrowFrom[tileSet];
    if (!chain) return false;
    if (!donorMatchesArtBorrowChain(donor.set, chain)) return false;
  }
  return true;
}

/** Browse face band — Carddass S1 ≠ S2–S5 ≠ S6 ≠ CCG s7+. */
export function narutoFaceBandKey(setCode: string | null | undefined): string {
  if (!setCode) return "other";
  const s = setCode.toLowerCase();
  if (s === "promo" || s === "prerelease") return s;
  if (s === "s1") return "s1";
  if (/^s[2-5]$/.test(s)) return "s2-s5";
  if (s === "s6") return "s6";
  if (/^s\d+$/.test(s) && Number(s.slice(1)) >= 7) return "ccg";
  if (isNarutoJapaneseVolumeSet(s)) return "maki";
  return s;
}

/**
 * Cardboard flag for admin tiles — same semantics as checklist `printed`.
 * HTML phantoms / cancelled S6 FR → false; attested S6 inserts stay cardboard.
 */
export function cataloguePrintedFlag(
  pack: CataloguePackId,
  printKey: string,
  card: string,
  lang: string,
  slotPrinted: boolean | undefined,
): false | undefined {
  if (!isNarutoUnifiedPack(pack)) {
    return slotPrinted === false ? false : undefined;
  }
  const code = lang.trim().toLowerCase();
  if (code === "fr" && isNarutoFrUnpublishedHtmlNumber(card)) return false;
  if (isNarutoS6FrPrintedNumber(card)) return undefined;
  if (narutoPrintKeySetCode(printKey) === "s6" && code === "fr") return false;
  if (slotPrinted === false) return false;
  return undefined;
}

export function resetCatalogueCardsCache(): void {
  clearIdentityCatalogueBrowseCache();
}

/** Card-local face file under `cards/{lang}/{set}/{card}/`. */
export function packFaceAssetUrl(
  pack: CataloguePackId,
  id: { set: string; lang: string; card: string },
  file: string,
): string {
  return assetsCardUrl(catalogueCorpusPack(pack), id, file);
}

/**
 * Naruto Carddass: printKey role URL only when bytes resolve on disk.
 * Stale index rows (`art.carddass.jpg` on s6 FR with no folder) must not mint
 * a 404 thumb — fall through to `missingArt` / verso.
 */
function narutoPrintScopedFaceFields(opts: {
  printKey: string;
  lang: string;
}): Pick<CatalogueCardRow, "artUrl" | "thumbUrl" | "artFallbackFrom"> | null {
  const { printKey, lang } = opts;
  const hit = resolveNarutoPrintFace({ printKey, lang, role: "face" });
  if (!hit) return null;
  const corpus = catalogueCorpusPack("naruto/carddass");
  return {
    artUrl: assetsPrintFaceUrl(corpus, printKey, lang, "face"),
    thumbUrl: assetsPrintFaceUrl(corpus, printKey, lang, "thumb"),
    ...(hit.source === "borrowed" && hit.donorPrintKey
      ? { artFallbackFrom: hit.donorPrintKey }
      : {}),
  };
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

/**
 * Short set tag for admin tiles (`S1`, `巻3`, `Promo`).
 * Membership lives on the printKey after set-scoping; `entry.set` is often
 * just the family folder (`ninja`).
 */
/** Catalogue set on a set-scoped printKey (`s1`, `maki3`) — not family `ni`. */
export function narutoPrintKeySetCode(printKey: string): string | null {
  const canon = canonicalizeNarutoPrintKey(printKey);
  const m = /^naruto:([a-z0-9]+)-/i.exec(canon);
  if (!m) return null;
  const set = m[1]!.toLowerCase();
  return isNarutoCatalogueSetCode(set) ? set : null;
}

export function narutoSetCodeTag(setCode: string | null): string | null {
  if (!setCode) return null;
  const set = setCode.toLowerCase();
  if (/^s\d+$/.test(set)) return set.toUpperCase();
  const maki = /^maki(\d+)$/.exec(set);
  if (maki) {
    // Product name is 巻ノ… — never the internal slug `maki1`.
    return `巻${maki[1]}`;
  }
  if (set === "promo") return "Promo";
  if (set === "prerelease") return "Prerelease";
  return set.toUpperCase();
}

export function narutoCatalogueSetTag(
  printKey: string,
  _lang?: string | null,
): string | null {
  return narutoSetCodeTag(narutoPrintKeySetCode(printKey));
}

/** Locale tile name — attested in that language only; siblings stay in aka. */
function catalogueNames(
  pack: CataloguePackId,
  printKey: string,
  entry: CardsIndexEntry,
  files: CardsIndexLangFiles | undefined,
  lang?: string,
): { name?: string; aka?: string[]; label: string } {
  const localeScoped = files !== undefined;
  const localName = files?.nameLocaleFrom?.trim()
    ? undefined
    : files?.name?.trim();
  const preferred = localeScoped
    ? localName
    : localName || entry.name?.trim() || undefined;
  const aka = [
    ...new Set(
      [
        ...(localeScoped ? [] : [entry.name?.trim()]),
        ...Object.values(entry.langs)
          .filter((langFiles) => !langFiles.nameLocaleFrom?.trim())
          .map((langFiles) => langFiles.name?.trim()),
      ].filter((n): n is string => Boolean(n && n !== preferred)),
    ),
  ];
  const useNarutoRef =
    cataloguePackInfo(pack)?.collectorCardFolder === true &&
    Boolean(narutoCollectorNumberKey(entry.card));
  const diskCard = catalogueDiskCard(pack, printKey, entry);
  /*
    疾風伝 : afficher la ref imprimée (`忍伝-学007`), pas `gaku · gaku0007` —
    c'est ce qu'on tape sur Suruga / carddas20.
    Carddass JA : `忍-349`, pas `NI-349` — même raison (Google / boutiques).
  */
  const printed =
    pack === "naruto/shippuden"
      ? formatShippudenReference(entry.set, entry.card)
      : useNarutoRef
        ? formatNarutoReference(entry.set, entry.card, lang)
        : `${entry.set} · ${diskCard}`;
  let setTag = useNarutoRef
    ? narutoCatalogueSetTag(printKey, lang)
    : null;
  // Ref already carries « · promo » / PR-… — don't prefix another Promo.
  if (
    setTag === "Promo" &&
    (/\bpromo\b/i.test(printed) || /^PR(?:-US)?-?\d/i.test(printed))
  ) {
    setTag = null;
  }
  const withSet = setTag ? `${setTag} · ${printed}` : printed;
  const label = preferred ? `${withSet} — ${preferred}` : withSet;
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

function localeSlots(
  entry: CardsIndexEntry,
  preferLang: string | undefined,
  expand: boolean,
  catalogueLocales?: readonly string[],
  opts: {
    keepEmptyLangStub?: boolean;
    inventEmptyLocales?: boolean;
  } = {},
): Array<{ lang: string; files: CardsIndexLangFiles }> {
  const langs = Object.entries(entry.langs);
  if (langs.length === 0) {
    /*
      Declared `catalogueLocales` wins — 疾風伝 must not invent FR just because
      the admin UI prefers French.

      Same-number fallback (Naruto promo) still needs a stub tile. Identity-only
      rows without a lang slot (Pokémon Live DE/IT/ES/ptbr stems, no face dump)
      must not become preferLang « incomplets ».
    */
    if (catalogueLocales?.length) {
      if (expand && opts.inventEmptyLocales) {
        return catalogueLocales.map((lang) => ({ lang, files: {} }));
      }
      if (opts.keepEmptyLangStub) {
        return [{ lang: catalogueLocales[0]!, files: {} }];
      }
      return [];
    }
    if (opts.keepEmptyLangStub) {
      return [{ lang: preferLang ?? "fr", files: {} }];
    }
    return [];
  }
  if (!expand) {
    const picked = pickLang(entry, preferLang);
    return picked ? [picked] : [];
  }
  if (catalogueLocales?.length) {
    const byLang = new Map(
      langs.map(([lang, files]) => [lang, files ?? {}] as const),
    );
    return catalogueLocales
      .map((lang) => ({
        lang,
        files: byLang.get(lang) ?? {},
      }))
      .filter((slot) => {
        if (opts.inventEmptyLocales) return true;
        return Object.keys(slot.files).length > 0;
      });
  }
  return langs
    .map(([lang, files]) => ({ lang, files: files ?? {} }))
    .sort((a, b) => compareNarutoLangs(a.lang, b.lang));
}

function donorMapKey(card: string, lang: string): string {
  return `${catalogueCollectorKey(card)}\0${lang.toLowerCase()}`;
}

/**
 * Browse identity: collector × face language × face band.
 * Promo / prerelease channels stay on their set-scoped printKey.
 *
 * FR/IT/EN: one tile per EU series membership (same as shelf checklist) —
 * do not collapse S2–S5 onto a single impression.
 * JA: 巻ノ band (EU s1–s5 shells fold onto the volume tile).
 */
function narutoBrowseIdentityKey(row: CatalogueCardRow): string {
  const lang = row.lang.toLowerCase();
  const membership = narutoPrintKeySetCode(row.printKey);
  if (membership === "promo" || membership === "prerelease") {
    return `${canonicalizeNarutoPrintKey(row.printKey)}\0${lang}`;
  }
  const collector =
    narutoCollectorKey(row.card) ?? canonicalizeNarutoPrintKey(row.printKey);
  /*
    JA checklist axis is 巻ノ. EU s1–s5 often hang the same JA name shell —
    collapse onto the volume band so FR keeps S1 ≠ S2–S5 while JA stays one tile.
  */
  if (
    lang === "ja" &&
    membership &&
    (isNarutoJapaneseVolumeSet(membership) || /^s[1-5]$/i.test(membership))
  ) {
    return `${collector}\0ja\0maki`;
  }
  /*
    Shelf checklist lists NI-009 on S1 + S3 + S4 as distinct slots, and CCG
    reprints (`s8-n0261`, `s11-n0261`, `s15-n0261`) likewise. Admin must keep
    the same set-scoped keys — a shared band hid S3/S4/S5 and S8/S15 tiles
    whenever one sibling carried the FR name.
  */
  if (
    membership &&
    /^s\d+$/i.test(membership) &&
    (lang === "fr" || lang === "it" || lang === "en")
  ) {
    return `${collector}\0${lang}\0${membership.toLowerCase()}`;
  }
  const band = narutoFaceBandKey(membership);
  return `${collector}\0${lang}\0${band}`;
}

/** Prefer the checklist axis that matches the face language. */
function membershipLocaleScore(
  setCode: string | null,
  lang: string,
): number {
  if (!setCode) return 0;
  const ja = lang.toLowerCase() === "ja";
  if (isNarutoJapaneseVolumeSet(setCode)) return ja ? 100 : -40;
  if (/^s\d+$/i.test(setCode)) {
    if (ja) return 0;
    return 100 + Math.max(0, 20 - Number(setCode.slice(1)));
  }
  return 5;
}

function catalogueRowScore(row: CatalogueCardRow): number {
  let score = 0;
  if (row.printed === false) score -= 100;
  else score += 20;
  if (row.artUrl && !row.missingArt && !row.artFallbackFrom) score += 10;
  if (!row.artFallbackFrom) score += 3;
  /*
    Named locale faces beat earlier-series invent shells. FR titles land on
    s11 (etc.) while s7–s10 keep FR art-only slots — membershipLocaleScore
    alone would pick Quest for Power over the named Curse reprint.
  */
  if (row.name?.trim()) score += 50;
  score += membershipLocaleScore(
    narutoPrintKeySetCode(row.printKey),
    row.lang,
  );
  return score;
}

function appearanceSetOfRow(row: CatalogueCardRow): string | null {
  return narutoPrintKeySetCode(row.printKey);
}

/**
 * One browse tile per collector impression + face language.
 *
 * EU FR/IT/EN keep each set-scoped membership (`s3-ni0009`, `s8-c0032`,
 * `s15-c0032`) — never `S8/S15` concat. JA still collapses EU shells onto the
 * 巻ノ tile.
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
    const key = narutoBrowseIdentityKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const collapsed: CatalogueCardRow[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      const only = list[0]!;
      const set = appearanceSetOfRow(only);
      collapsed.push(
        set && !only.appearanceSets
          ? { ...only, appearanceSets: [set] }
          : only,
      );
      continue;
    }
    list.sort((a, b) => {
      const byScore = catalogueRowScore(b) - catalogueRowScore(a);
      if (byScore !== 0) return byScore;
      return a.printKey.localeCompare(b.printKey);
    });
    const winner = list[0]!;
    const appearanceSets = [
      ...new Set(
        list
          .map((row) => appearanceSetOfRow(row))
          .filter((set): set is string => Boolean(set)),
      ),
    ].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    // JA 巻ノ collapse may list makiN + EU sN for locale-axis filters — never
    // rewrite the caption as `巻1/S1` / `S8/S15`.
    collapsed.push(
      appearanceSets.length ? { ...winner, appearanceSets } : winner,
    );
  }
  return collapseNarutoAbBareJaRows(
    dropUnprintedWhenPrintedSiblingExists(
      [...passthrough, ...collapsed].sort(compareNarutoCatalogueRows),
    ),
  );
}

/** Drop unprinted stubs when a printed face of the same collector+lang+band exists. */
function dropUnprintedWhenPrintedSiblingExists(
  rows: CatalogueCardRow[],
): CatalogueCardRow[] {
  const printedCollectors = new Set<string>();
  for (const row of rows) {
    if (row.kind && row.kind !== "face") continue;
    if (row.printed === false) continue;
    const collector = narutoCollectorKey(row.card);
    if (!collector) continue;
    const band = narutoFaceBandKey(narutoPrintKeySetCode(row.printKey));
    printedCollectors.add(`${collector}\0${row.lang.toLowerCase()}\0${band}`);
  }
  if (printedCollectors.size === 0) return rows;
  return rows.filter((row) => {
    if (row.kind && row.kind !== "face") return true;
    if (row.printed !== false) return true;
    const collector = narutoCollectorKey(row.card);
    if (!collector) return true;
    const band = narutoFaceBandKey(narutoPrintKeySetCode(row.printKey));
    return !printedCollectors.has(
      `${collector}\0${row.lang.toLowerCase()}\0${band}`,
    );
  });
}

/**
 * JP 巻ノ doubles are two arts of one printed number (○ / ● marks on the
 * carton; TV Tokyo / Suruga label them `-a` / `-b`). The unsuffixed JA row is
 * a host leftover whose recto always matches one of those two — keep FR/EN
 * bare (EU carton), drop bare JA only when both siblings are present.
 * 雪姫 (`ni0001-a` without `-b`) is untouched: retail bare ≠ `-a`.
 */
function collapseNarutoAbBareJaRows(
  rows: CatalogueCardRow[],
): CatalogueCardRow[] {
  const groupingsByNumber = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.kind && row.kind !== "face") continue;
    const numberKey = narutoCollectorNumberKey(row.card);
    if (!numberKey) continue;
    const grouping =
      parseNarutoCollector(row.card)?.grouping?.toLowerCase() ?? "";
    const set = groupingsByNumber.get(numberKey) ?? new Set<string>();
    set.add(grouping);
    groupingsByNumber.set(numberKey, set);
  }
  const hideBareJa = new Set<string>();
  for (const [numberKey, groupings] of groupingsByNumber) {
    if (groupings.has("a") && groupings.has("b")) {
      hideBareJa.add(numberKey);
    }
  }
  if (hideBareJa.size === 0) return rows;
  return rows.filter((row) => {
    if (row.kind && row.kind !== "face") return true;
    if (row.lang.toLowerCase() !== "ja") return true;
    const grouping =
      parseNarutoCollector(row.card)?.grouping?.toLowerCase() ?? "";
    if (grouping) return true;
    const numberKey = narutoCollectorNumberKey(row.card);
    return numberKey == null || !hideBareJa.has(numberKey);
  });
}

/** Build browse rows from an in-memory index (also used by unit tests). */
export function buildCatalogueCardRows(
  pack: CataloguePackId,
  index: CardsIndexV1,
  preferLang?: string,
): CatalogueCardRow[] {
  const packInfo = cataloguePackInfo(pack);
  const allowFallback = packInfo?.sameNumberArtFallback === true;
  const artBorrowFrom = packInfo?.artBorrowFrom;
  const expandLocales =
    packInfo?.expandLocales === true || isNarutoUnifiedPack(pack);
  const catalogueLocales = packInfo?.catalogueLocales;
  const inventEmptyLocales = packInfo?.catalogueExpandMissingLocales === true;
  const corpusPack = catalogueCorpusPack(pack);
  const bestFaceAcrossLocales =
    packInfo?.localeArt?.bestFaceAcrossLocales === true;
  const countLocalizedNames =
    packInfo?.localeArt?.countLocalizedNames === true;
  const localeSpecificFaces = bestFaceAcrossLocales
    ? loadLocaleSpecificFaces(corpusPack)
    : null;
  const localeSpecificLocales =
    catalogueLocales ??
    (countLocalizedNames ? (["fr", "ja", "en"] as const) : []);
  const source = isNarutoUnifiedPack(pack)
    ? foldNarutoCardsIndex(index)
    : index;

  const donorsByNumber = new Map<string, ArtDonor[]>();
  if (allowFallback) {
    for (const [printKey, entry] of Object.entries(source.cards)) {
      for (const slot of localeSlots(
        entry,
        preferLang,
        true,
        catalogueLocales,
        { keepEmptyLangStub: allowFallback, inventEmptyLocales },
      )) {
        const file = artFile(slot.files);
        if (!file) continue;
        const key = donorMapKey(entry.card, slot.lang);
        const thumb = thumbFile(slot.files) ?? undefined;
        const candidate: ArtDonor = {
          printKey,
          set: narutoDiskSetForArt(printKey, entry.card, entry.set),
          card: entry.card,
          lang: slot.lang,
          file,
          ...(thumb ? { thumb } : {}),
        };
        const list = donorsByNumber.get(key) ?? [];
        list.push(candidate);
        donorsByNumber.set(key, list);
      }
    }
    for (const [key, list] of donorsByNumber) {
      list.sort(
        (a, b) =>
          donorScore(b.set, b.file, b.card) - donorScore(a.set, a.file, a.card),
      );
      donorsByNumber.set(key, list);
    }
  }

  const pickArtDonor = (
    tilePrintKey: string,
    tileCard: string,
    lang: string,
    tileEntrySet?: string,
  ): ArtDonor | undefined => {
    const list = donorsByNumber.get(donorMapKey(tileCard, lang));
    if (!list?.length) return undefined;
    const tileSet = narutoArtChannelSet(tilePrintKey, tileCard, tileEntrySet);
    if (artBorrowFrom && tileSet) {
      const chain = artBorrowFrom[tileSet];
      if (!chain) return undefined;
      for (const set of chain) {
        const hit = list.find(
          (d) =>
            (d.set.toLowerCase() === set.toLowerCase() ||
              isNarutoRetailFamilySet(d.set)) &&
            acceptArtDonor(
              tilePrintKey,
              tileCard,
              d,
              artBorrowFrom,
              tileSet,
            ),
        );
        if (hit) return hit;
      }
      return list.find((d) =>
        acceptArtDonor(tilePrintKey, tileCard, d, artBorrowFrom, tileSet),
      );
    }
    return list.find((d) => acceptArtDonor(tilePrintKey, tileCard, d));
  };

  const rows: CatalogueCardRow[] = [];
  for (const [printKey, entry] of Object.entries(source.cards)) {
    const hasFoil = entryHasFoil(entry);
    for (const slot of localeSlots(
      entry,
      preferLang,
      expandLocales,
      catalogueLocales,
      { keepEmptyLangStub: allowFallback, inventEmptyLocales },
    )) {
      const lang = slot.lang;
      if (isJpOnlyNarutoArtwork(entry.card) && lang.toLowerCase() !== "ja") {
        continue;
      }
      /*
        巻ノ memberships are the JA checklist axis. Disk attach often hangs the
        shared FR recto on `maki*` printKeys (same `cards/{family}/{id}/fr/`);
        without an EU `sN` sibling that FR shell becomes a browse tile and
        contaminates the preferred-lang FR grid with Japanese volume cards.
      */
      if (
        isNarutoJapaneseVolumeSet(narutoPrintKeySetCode(printKey)) &&
        lang.toLowerCase() !== "ja"
      ) {
        continue;
      }
      if (
        isNarutoMangaPrerelease(entry) &&
        lang.toLowerCase() !== "fr"
      ) {
        continue;
      }
      /*
        JA-only tourney reprints (`te0107-promo` eBay) mint a promo printKey with
        a hung FR title + borrowed S3 art. Promo checklist (same gate as search)
        is the FR/IT attestation — never invent EU tiles for those.
      */
      if (
        isNarutoUnifiedPack(pack) &&
        narutoArtChannelSet(printKey, entry.card, entry.set) === "promo" &&
        (lang === "fr" || lang === "it") &&
        !belongsOnNarutoPromoChecklist(entry.card)
      ) {
        continue;
      }
      const languageSpecific = bestFaceAcrossLocales
        ? isLocaleSpecificFace(
            localeSpecificFaces,
            entry.set,
            entry.card,
          ) ||
          (countLocalizedNames &&
            entryIsLocaleSpecificFace(entry, localeSpecificLocales, {
              countLocalizedNames: true,
            }))
        : true;
      const names = catalogueNames(pack, printKey, entry, slot.files, lang);
      const diskCard = catalogueDiskCard(pack, printKey, entry);
      const diskSet = narutoDiskSetForArt(printKey, entry.card, entry.set);
      const identityBase = {
        printKey,
        set: diskSet,
        card: entry.card,
        hasFoil,
        label: names.label,
        languageSpecific,
        ...(names.name ? { name: names.name } : {}),
        ...(names.aka ? { aka: names.aka } : {}),
        ...(entry.rarity ? { rarity: entry.rarity } : {}),
        ...(cataloguePrintedFlag(pack, printKey, entry.card, lang, slot.files.printed) ===
        false
          ? { printed: false }
          : {}),
        ...(entry.lenticularGrid ? { lenticularGrid: entry.lenticularGrid } : {}),
        ...(slot.files.nameSource ? { nameSource: slot.files.nameSource } : {}),
      };

      /*
        Same-art reprints (prerelease / promo / cdf) often hang a JA shop scan
        on the stub while the FR booster face lives on the retail printKey.
        Prefer that same-lang retail donor *before* bestFaceAcrossLocales, or
        the FR tile shows « art JA » for a card that is the same FR print.
      */
      /*
        Naruto Carddass: art URL is always print-scoped. The HTTP resolver
        serves owned or borrowed bytes and exposes X-Placarr-Art-Source.
      */
      if (isNarutoUnifiedPack(pack)) {
        const orient = orientationFromIndexSlot(entry, slot.files);
        const landscapePrint = printIsLandscapeCard(entry);
        const identity = {
          ...identityBase,
          ...(orient.landscapeFace ? { landscapeFace: true } : {}),
          ...(orient.faceQuarterTurns
            ? { faceQuarterTurns: orient.faceQuarterTurns }
            : {}),
          ...(landscapePrint ? { landscapePrint: true } : {}),
        };
        const scoped = narutoPrintScopedFaceFields({ printKey, lang });
        if (scoped) {
          rows.push({
            ...identity,
            lang,
            ...scoped,
          });
          continue;
        }
        const remote = remoteArtUrl(slot.files);
        if (remote) {
          rows.push({ ...identity, lang, artUrl: remote });
          continue;
        }
        const back = backFile(slot.files);
        if (back) {
          rows.push({
            ...identity,
            lang,
            artUrl: packFaceAssetUrl(pack, {
              set: diskSet,
              lang,
              card: diskCard,
            }, back),
            versoOnly: true,
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

      const tileOwnArt = artFile(slot.files);
      if (!tileOwnArt && allowFallback) {
        const donor = pickArtDonor(printKey, entry.card, lang, diskSet);
        if (donor) {
          const donorDisk = {
            set: donor.set,
            lang: donor.lang,
            card: catalogueDiskCard(pack, donor.printKey, {
              card: donor.card,
            }),
          };
          const artUrl = packFaceAssetUrl(pack, donorDisk, donor.file);
          const thumbUrl = donor.thumb
            ? packFaceAssetUrl(pack, donorDisk, donor.thumb)
            : undefined;
          rows.push({
            ...identityBase,
            lang,
            artUrl,
            ...(thumbUrl ? { thumbUrl } : {}),
            artFallbackFrom: donor.printKey,
          });
          continue;
        }
      }

      const face = resolveCatalogueFace({
        entry,
        tileLang: lang,
        tileFiles: slot.files,
        catalogueLocales,
        languageSpecific,
        bestFaceAcrossLocales,
      });
      const file = face.file;
      // Names stay on the tile locale — borrowing a recto must not paste an EN
      // title onto a FR shell (attested gap stays empty).
      const orient = orientationFromIndexSlot(entry, face.files);
      const landscapePrint = printIsLandscapeCard(entry);
      const artLocaleFrom =
        file && face.artLang.toLowerCase() !== lang.toLowerCase()
          ? face.artLang
          : undefined;
      const identity = {
        ...identityBase,
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
          set: diskSet,
          lang,
          card: diskCard,
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
          ? pickArtDonor(printKey, entry.card, lang, diskSet)
          : undefined;
        if (donor) {
          const donorDisk = {
            set: donor.set,
            lang: donor.lang,
            card: catalogueDiskCard(pack, donor.printKey, {
              card: donor.card,
            }),
          };
          const artUrl = packFaceAssetUrl(pack, donorDisk, donor.file);
          const thumbUrl = donor.thumb
            ? packFaceAssetUrl(pack, donorDisk, donor.thumb)
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
        set: diskSet,
        lang: face.artLang,
        card: diskCard,
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
  /** Kayou-style tier sleeves — `back.<slug>.webp` at pack root. */
  tierBackUrls?: readonly { slug: string; url: string }[];
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

  const tierUrlSet = new Set(
    (input.tierBackUrls ?? []).map((row) => row.url),
  );

  const out: CatalogueCardRow[] = [];
  for (const tier of input.tierBackUrls ?? []) {
    /*
      `back.ja.webp` is a locale sleeve — tag it so preferred-lang filters apply.
      Rarity tiers (`back.hr.webp`, Kayou) stay shared (`—`).
    */
    const tierLang = catalogueBackLangFromTierSlug(tier.slug);
    out.push({
      printKey: `${input.pack}:__pack-back-tier-${tier.slug}__`,
      set: "",
      card: "back",
      lang: tierLang,
      artUrl: tier.url,
      hasFoil: false,
      label: `Dos · pack · ${tier.slug.toUpperCase()}`,
      kind: "pack-back",
    });
  }
  for (const tile of backTiles(input.packBackUrl)) {
    if (tierUrlSet.has(tile.url)) continue;
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
  const tierBackUrls = listPackTierBackSlugs(corpus).flatMap((slug) => {
    const url = assetsPackTierBackUrl(corpus, slug);
    return url ? [{ slug, url }] : [];
  });
  const setBackUrls = new Map<string, CatalogueBackTile[]>();
  for (const set of new Set(faceRows.map((r) => r.set))) {
    const tiles = distinct((lang) => assetsSetBackUrl(corpus, set, lang));
    if (tiles.length) setBackUrls.set(set, tiles);
  }
  return mergeCatalogueBackRows({
    pack,
    faceRows,
    packBackUrl,
    tierBackUrls,
    setBackUrls,
  });
}

function cachedFaces(
  pack: CataloguePackId,
  _preferLang?: string,
): CatalogueCardRow[] {
  /*
    Null identity = missing/empty catalog.sqlite for this pack — honest empty,
    never a silent cards-index.json projection.
  */
  return tryBuildIdentityCatalogueRows(pack) ?? [];
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

function isFaceRow(row: CatalogueCardRow): boolean {
  return row.kind !== "pack-back" && row.kind !== "set-back";
}

/** Locale-coded sleeve file (`back.ja.webp`) vs shared rarity tier (`back.hr.webp`). */
const BACK_TIER_LOCALE = /^(fr|en|it|de|es|pt|ptbr|ja|jp)$/i;

export function catalogueBackLangFromTierSlug(slug: string): string {
  const raw = slug.trim().toLowerCase();
  if (!BACK_TIER_LOCALE.test(raw)) return "—";
  return raw === "jp" ? "ja" : raw;
}

/** FR retail + late exceptions (S6 inserts, Rampage/s11, Sage's/s24, Storm3/s28). */
function isNarutoFrenchRetailSet(set: string): boolean {
  const id = set.trim().toLowerCase();
  if (id === "promo" || id === "prerelease") return true;
  const series = /^s(\d+)$/i.exec(id);
  if (!series) return false;
  const n = Number(series[1]);
  if (n <= 5) return true;
  return n === 6 || n === 11 || n === 24 || n === 28;
}

/** Italian Carddass retail = S1–S6 (+ promo / prerelease). */
function isNarutoItalianRetailSet(set: string): boolean {
  const id = set.trim().toLowerCase();
  if (id === "promo" || id === "prerelease") return true;
  const series = /^s(\d+)$/i.exec(id);
  return !!series && Number(series[1]) <= 6;
}

/** Late Bandai USA sets with Coleka FR titles (not Path of the Hokage s1–s6). */
function isNarutoFrenchColekaCcgSet(set: string): boolean {
  const m = /^s(\d+)$/i.exec(set.trim());
  if (!m) return false;
  const n = Number(m[1]);
  return n === 11 || n === 24 || n === 28;
}

/**
 * Carddass preferred-lang axis: JA ↔ 巻ノ, FR/IT ↔ Carddass EU, EN ↔ CCG.
 * Blocks hung JA shop scans on EU-only printKeys and CCG `N-013` Coleka FR
 * shells next to Carddass `NI-013` on S1 — « Toutes locales » still lists all.
 */
export function matchesNarutoPreferredLocaleAxis(
  row: CatalogueCardRow,
  preferLang: string,
): boolean {
  if (!isFaceRow(row)) return true;
  const want = preferLang.trim().toLowerCase();
  if (!want) return true;
  const sets =
    row.appearanceSets?.length
      ? row.appearanceSets
      : ([narutoPrintKeySetCode(row.printKey)].filter(Boolean) as string[]);
  const line = narutoCatalogueLineForCard(
    row.card,
    sets[0] ?? narutoPrintKeySetCode(row.printKey) ?? undefined,
  );
  if (want === "ja") {
    if (isJpOnlyNarutoArtwork(row.card)) return true;
    return sets.some((set) => isNarutoJapaneseVolumeSet(set));
  }
  if (want === "fr") {
    if (!sets.length) return true;
    /*
      S1–S6 CCG (`N-013`) is English Bandai USA — Coleka FR titles must not sit
      beside Carddass `NI-013` (« Hokage le 3e »). Late CCG s11/s24/s28 keep FR.
    */
    if (line === "en-ccg") {
      return sets.some((set) => isNarutoFrenchColekaCcgSet(set));
    }
    if (
      sets.some((set) => set.toLowerCase() === "promo") &&
      !belongsOnNarutoPromoChecklist(row.card)
    ) {
      return false;
    }
    return sets.some((set) => isNarutoFrenchRetailSet(set));
  }
  if (want === "it") {
    if (line === "en-ccg") return false;
    if (!sets.length) return true;
    if (
      sets.some((set) => set.toLowerCase() === "promo") &&
      !belongsOnNarutoPromoChecklist(row.card)
    ) {
      return false;
    }
    return sets.some((set) => isNarutoItalianRetailSet(set));
  }
  if (want === "en") {
    // Preferred EN = CCG checklist, not Carddass NI/TE doubles.
    if (line === "carddass-fr") return false;
    if (!sets.length) return true;
    return sets.some((set) => !isNarutoJapaneseVolumeSet(set));
  }
  return true;
}

/**
 * Preferred-lang browse: neutral rectos stay visible under every language;
 * language-specific rectos only under their own `lang`.
 * Backs follow the same rule: `lang === "—"` is shared; otherwise match preferLang.
 */
export function matchesCataloguePreferredLang(
  row: CatalogueCardRow,
  preferLang: string,
  opts: {
    expandLocales?: boolean;
    narutoLocaleAxis?: boolean;
    /**
     * Packs with cross-locale face borrow (Ninja Ranks): a language-specific
     * tile that only has a title (no scan) is an invent shell — hide it in
     * preferred browse. Carddass keeps titled FR checklist cards awaiting art.
     */
    hideLanguageSpecificMissingArt?: boolean;
  } = {},
): boolean {
  const want = preferLang.trim().toLowerCase();
  if (!want) return true;
  if (!isFaceRow(row)) {
    const backLang = row.lang.trim();
    if (!backLang || backLang === "—") return true;
    return backLang.toLowerCase() === want;
  }
  if (row.languageSpecific) {
    if (row.lang.toLowerCase() !== want) return false;
    /*
      Expand packs invent empty FR shells for IT-only / JA-only text cards —
      hide nameless missing-art invents. Official EU titles without a scan yet
      (TA-90 « Le don de la copie ») must stay visible as missingArt — unless
      the pack borrows faces across locales (then the titled shell is noise).
    */
    if (opts.expandLocales && (row.missingArt || row.versoOnly)) {
      if (!row.name?.trim()) return false;
      if (opts.hideLanguageSpecificMissingArt) return false;
    }
    if (
      opts.narutoLocaleAxis &&
      !matchesNarutoPreferredLocaleAxis(row, want)
    ) {
      return false;
    }
    return true;
  }
  // Neutral + expandLocales: one tile for the preferred lang (borrowed art OK).
  if (opts.expandLocales) {
    if (row.lang.toLowerCase() !== want) return false;
    // Nameless empty invent shells (retail stub when promo holds the face).
    if ((row.missingArt || row.versoOnly) && !row.name?.trim()) return false;
    if (
      opts.narutoLocaleAxis &&
      !matchesNarutoPreferredLocaleAxis(row, want)
    ) {
      return false;
    }
    return true;
  }
  // Neutral + pickLang: single tile already — keep even if lang ≠ UI language.
  return true;
}

/** `all` = no printed filter; `printed` / `unprinted` = cardboard vs not. */
export type CataloguePrintedFilter = "all" | "printed" | "unprinted";

/** Audit filters for catalogue browse (unit-tested). */
export function matchesCatalogueAuditFilter(
  row: CatalogueCardRow,
  filter: {
    incompleteOnly?: boolean;
    missingArtOnly?: boolean;
    missingNameOnly?: boolean;
    missingPriceOnly?: boolean;
    borrowedArtOnly?: boolean;
  },
): boolean {
  if (!isFaceRow(row)) return false;
  const checks: boolean[] = [];
  if (filter.incompleteOnly) {
    checks.push(Boolean(row.missingArt || row.versoOnly || !row.name?.trim()));
  }
  if (filter.missingArtOnly) checks.push(Boolean(row.missingArt));
  if (filter.missingNameOnly) checks.push(!row.name?.trim());
  if (filter.missingPriceOnly) {
    checks.push(!(typeof row.priceCents === "number" && row.priceCents > 0));
  }
  if (filter.borrowedArtOnly) {
    checks.push(Boolean(row.artFallbackFrom || row.artLocaleFrom));
  }
  return checks.some(Boolean);
}

/**
 * Printed cardboard filter — faces only.
 * Pack/set backs are excluded from both « Imprimées » and « Non imprimées ».
 */
export function matchesCataloguePrintedFilter(
  row: CatalogueCardRow,
  printed: CataloguePrintedFilter | undefined,
): boolean {
  if (!printed || printed === "all") return true;
  if (!isFaceRow(row)) return false;
  const isPrinted = row.printed !== false;
  return printed === "printed" ? isPrinted : !isPrinted;
}

export type ListCatalogueCardsInput = {
  pack: CataloguePackId;
  /** When true, only rows with foil-related assets. */
  foilOnly?: boolean;
  /** When true, only rows missing a face or a name (audit / debug). */
  incompleteOnly?: boolean;
  /** When true, only rows without a recto/thumb file. */
  missingArtOnly?: boolean;
  /** When true, only rows without a locale name. */
  missingNameOnly?: boolean;
  /** When true, only face rows with no positive reference price. */
  missingPriceOnly?: boolean;
  /** When true, only rows showing inherited (borrowed) art. */
  borrowedArtOnly?: boolean;
  /** Cardboard filter — default `all` (admin shows unprinted too). */
  printed?: CataloguePrintedFilter;
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
  /** Locales du pack, pour le sélecteur de langue côté client. */
  availableLocales: string[];
};

/** Déclarées sur le pack, sinon mesurées sur les tuiles faces du catalogue. */
export function catalogueAvailableLocales(
  pack: CataloguePackId,
  rows: readonly CatalogueCardRow[],
): string[] {
  const declared = cataloguePackInfo(pack)?.catalogueLocales;
  if (declared?.length) return [...declared];
  const measured = [
    ...new Set(
      rows
        .filter(
          (row) => row.kind !== "pack-back" && row.kind !== "set-back",
        )
        .map((row) => row.lang.trim().toLowerCase())
        .filter((lang) => lang && lang !== "—"),
    ),
  ];
  measured.sort((a, b) => a.localeCompare(b));
  return measured;
}

/**
 * « Toutes locales » = declared admin surface, not every lang on disk.
 * Pokémon Live still indexes de/it/es/ptbr as separate printKeys.
 */
export function restrictRowsToCatalogueLocales(
  rows: readonly CatalogueCardRow[],
  catalogueLocales: readonly string[] | undefined,
): CatalogueCardRow[] {
  if (!catalogueLocales?.length) return [...rows];
  const allow = new Set(catalogueLocales.map((lang) => lang.toLowerCase()));
  return rows.filter((row) => {
    const lang = row.lang.trim().toLowerCase();
    return lang === "—" || allow.has(lang);
  });
}

export async function listCatalogueCards(
  input: ListCatalogueCardsInput,
): Promise<ListCatalogueCardsResult> {
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.min(1000, Math.max(1, Math.floor(input.limit ?? 48)));
  let rows = rowsForPack(input.pack, input.preferLang);
  const availableLocales = catalogueAvailableLocales(input.pack, rows);
  const localeMode = input.locales ?? "preferred";
  let preferLang = input.preferLang?.trim().toLowerCase();
  /*
    UI defaults to the page locale (often `fr`). Japanese-only packs declare
    `catalogueLocales: ["ja"]` — coerce before filtering so we don't hide every
    language-specific tile behind an empty FR shell.
  */
  if (
    localeMode === "preferred" &&
    preferLang &&
    availableLocales.length > 0 &&
    !availableLocales.includes(preferLang)
  ) {
    preferLang = availableLocales.includes("en")
      ? "en"
      : availableLocales[0]!;
  }
  const packInfo = cataloguePackInfo(input.pack);
  const expandsLocales =
    packInfo?.expandLocales === true || isNarutoUnifiedPack(input.pack);
  if (localeMode === "all") {
    /*
      Declared catalogueLocales are the admin surface (Pokémon = ja/fr/en).
      Live still indexes de/it/es/ptbr as separate printKeys — without this
      filter, « Toutes locales » counted every CDN lang and inflated
      « sans prix » while the dropdown only offered catalogue locales.
    */
    rows = restrictRowsToCatalogueLocales(rows, packInfo?.catalogueLocales);
  } else if (localeMode === "preferred" && preferLang) {
    rows = rows.filter((row) =>
      matchesCataloguePreferredLang(row, preferLang!, {
        expandLocales: expandsLocales,
        narutoLocaleAxis: isNarutoUnifiedPack(input.pack),
        hideLanguageSpecificMissingArt:
          packInfo?.localeArt?.bestFaceAcrossLocales === true,
      }),
    );
  }
  if (input.foilOnly) {
    rows = rows.filter((row) => row.hasFoil);
  }
  if (input.printed && input.printed !== "all") {
    rows = rows.filter((row) =>
      matchesCataloguePrintedFilter(row, input.printed),
    );
  }
  if (
    input.incompleteOnly ||
    input.missingArtOnly ||
    input.missingNameOnly ||
    input.borrowedArtOnly
  ) {
    rows = rows.filter((row) =>
      matchesCatalogueAuditFilter(row, {
        incompleteOnly: input.incompleteOnly,
        missingArtOnly: input.missingArtOnly,
        missingNameOnly: input.missingNameOnly,
        borrowedArtOnly: input.borrowedArtOnly,
      }),
    );
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

  const corpus = catalogueCorpusPack(input.pack);
  if (input.missingPriceOnly) {
    const faceKeys = [
      ...new Set(rows.filter(isFaceRow).map((row) => row.printKey)),
    ];
    const priceByKey = await catalogueCardPriceQuoteByPrintKey(
      corpus,
      faceKeys,
    );
    rows = rows.map((row) => attachPriceQuote(row, priceByKey));
    rows = rows.filter((row) =>
      matchesCatalogueAuditFilter(row, { missingPriceOnly: true }),
    );
    return {
      pack: input.pack,
      total: rows.length,
      offset,
      limit,
      cards: rows.slice(offset, offset + limit),
      availableLocales,
    };
  }

  const page = rows.slice(offset, offset + limit);
  const pageKeys = [
    ...new Set(page.filter(isFaceRow).map((row) => row.printKey)),
  ];
  const priceByKey = await catalogueCardPriceQuoteByPrintKey(
    corpus,
    pageKeys,
  );
  return {
    pack: input.pack,
    total: rows.length,
    offset,
    limit,
    cards: page.map((row) => attachPriceQuote(row, priceByKey)),
    availableLocales,
  };
}

function attachPriceQuote(
  row: CatalogueCardRow,
  priceByKey: ReadonlyMap<
    string,
    {
      priceCents: number;
      priceDeltaCents?: number | null;
      shopItemId?: string | null;
    }
  >,
): CatalogueCardRow {
  if (!isFaceRow(row)) {
    return {
      ...row,
      priceCents: null,
      priceDeltaCents: null,
      shopItemId: null,
    };
  }
  const quote = priceByKey.get(row.printKey);
  const cents = quote?.priceCents;
  return {
    ...row,
    priceCents: cents != null && cents > 0 ? cents : null,
    priceDeltaCents:
      quote?.priceDeltaCents != null && Number.isFinite(quote.priceDeltaCents)
        ? quote.priceDeltaCents
        : null,
    shopItemId: quote?.shopItemId?.trim() || null,
  };
}
