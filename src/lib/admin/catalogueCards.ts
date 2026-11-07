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
  includesFolded,
  normalizeForTokens,
} from "@/core/enrich/titles/normalize";
import {
  assetsCardUrl,
  cardDiskIdFromPrintKey,
} from "@/lib/packAssetUrls";
import {
  assetsPackBackUrl,
  assetsPackTierBackUrl,
  assetsSetBackUrl,
  listPackTierBackSlugs,
  resolvePackBackPath,
  resolveSetBackPath,
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
import { narutoCatalogueLineForCard } from "@/providers/naruto/narutocarddass/packs";
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
import { overscanFilterPageAsync } from "@/lib/admin/catalogueOverscan";
import {
  hydrateRegisteredBrowseRow,
  listRegisteredFaceBrowsePage,
} from "@/lib/admin/catalogueBrowseRegistry";
import { cataloguePackHooks } from "@/lib/admin/cataloguePackHooks";
import {
  matchesNarutoPreferredLocaleAxis,
} from "@/providers/naruto/narutocarddass/preferredLocaleAxis";
import {
  createLocalPrintsIndex,
  type LocalPrintSearchRow,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { resolveCatalogueLocalArtUrl } from "@/providers/shared/cardCatalogue/localCatalogueFace";
export { isNarutoJapaneseVolumeSet };
/** @deprecated Prefer {@link cataloguePackHooks}.matchesPreferredLocaleAxis. */
export { matchesNarutoPreferredLocaleAxis };

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
  const rules = cataloguePackInfo(pack)?.cardboardPrintedRules ?? "slot";
  if (rules === "naruto-carddass") {
    const code = lang.trim().toLowerCase();
    if (code === "fr" && isNarutoFrUnpublishedHtmlNumber(card)) return false;
    if (isNarutoS6FrPrintedNumber(card)) return undefined;
    if (narutoPrintKeySetCode(printKey) === "s6" && code === "fr") return false;
  }
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

/** Build browse rows from an in-memory index (also used by unit tests). */
export function buildCatalogueCardRows(
  pack: CataloguePackId,
  index: CardsIndexV1,
  preferLang?: string,
): CatalogueCardRow[] {
  const packInfo = cataloguePackInfo(pack);
  const hooks = cataloguePackHooks(pack);
  const allowFallback = packInfo?.sameNumberArtFallback === true;
  const artBorrowFrom = packInfo?.artBorrowFrom;
  const expandLocales = packInfo?.expandLocales === true;
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
  const source = hooks.foldCardsIndex
    ? hooks.foldCardsIndex(index)
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
        packInfo?.gatePromoLocaleTiles &&
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
      if (hooks.resolvePrintScopedFace) {
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
        const scoped = hooks.resolvePrintScopedFace({ printKey, lang });
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
  if (expandLocales && hooks.collapseCatalogueIdentityRows) {
    return hooks.collapseCatalogueIdentityRows(rows);
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

/**
 * Collapse pack/set backs that share one disk file.
 *
 * Role URLs differ by lang (`/backs/fr` vs `/backs/ja`) even when both resolve
 * to the same `back.webp` — keying on URL duplicated « Dos · pack » +
 * « Dos · pack · JA ». Distinct by realpath; locale-only sleeves keep their lang.
 */
function distinctBackTilesByDisk(input: {
  langs: readonly string[];
  resolveDisk: (lang: string | undefined) => string | null;
  toUrl: (lang: string | undefined) => string | null;
}): CatalogueBackTile[] {
  const byDisk = new Map<string, string>();
  const sharedDisk = input.resolveDisk(undefined);
  if (sharedDisk) byDisk.set(sharedDisk, "—");
  for (const lang of input.langs) {
    const disk = input.resolveDisk(lang);
    if (!disk || byDisk.has(disk)) continue;
    byDisk.set(disk, lang);
  }
  const tiles: CatalogueBackTile[] = [];
  for (const [disk, lang] of byDisk) {
    const url =
      lang === "—"
        ? input.toUrl(undefined) ?? input.toUrl("fr")
        : input.toUrl(lang);
    if (!url) continue;
    // Guarantees we only emit tiles whose disk we already accepted.
    void disk;
    tiles.push({ url, lang });
  }
  return tiles;
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
  const corpus = catalogueCorpusPack(pack);
  const packBackUrl = distinctBackTilesByDisk({
    langs,
    resolveDisk: (lang) => resolvePackBackPath(corpus, lang),
    toUrl: (lang) => assetsPackBackUrl(corpus, lang),
  });
  /*
    Locale sleeves (`back.ja.webp`) are resolved via `packBackUrl` above.
    Listing them again as tiers (`/backs/…/tiers/ja`) duplicates the same
    file under a second role URL → two « Dos · pack · JA » tiles.
    Tier rows stay for rarity sleeves (Kayou HR/SR/…).
  */
  const tierBackUrls = listPackTierBackSlugs(corpus).flatMap((slug) => {
    if (catalogueBackLangFromTierSlug(slug) !== "—") return [];
    const url = assetsPackTierBackUrl(corpus, slug);
    return url ? [{ slug, url }] : [];
  });
  const setBackUrls = new Map<string, CatalogueBackTile[]>();
  for (const set of new Set(faceRows.map((r) => r.set))) {
    const tiles = distinctBackTilesByDisk({
      langs,
      resolveDisk: (lang) => resolveSetBackPath(corpus, set, lang),
      toUrl: (lang) => assetsSetBackUrl(corpus, set, lang),
    });
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

function withUnifiedMultiLineBacks(
  pack: CataloguePackId,
  faces: CatalogueCardRow[],
): CatalogueCardRow[] {
  const langs = [
    ...new Set(["fr", "en", "it", "ja", ...faces.map((row) => row.lang)]),
  ].filter(Boolean);
  const corpus = catalogueCorpusPack(pack);
  // Same disk-dedupe as withCatalogueBackRows — shared back.webp ≠ one tile per lang URL.
  const tiles = distinctBackTilesByDisk({
    langs,
    resolveDisk: (lang) => resolvePackBackPath(corpus, lang),
    toUrl: (lang) => assetsPackBackUrl(corpus, lang),
  }).map((tile) => ({
    ...tile,
    key: tile.lang === "—" ? undefined : `-${tile.lang}`,
  }));
  return mergeCatalogueBackRows({
    pack,
    faceRows: faces,
    packBackUrl: tiles,
    setBackUrls: {},
  });
}

function rowsForPack(
  pack: CataloguePackId,
  preferLang?: string,
): CatalogueCardRow[] {
  if (cataloguePackInfo(pack)?.unifiedCatalogueBacks) {
    return withUnifiedMultiLineBacks(pack, cachedFaces(pack, preferLang));
  }
  const faces = cachedFaces(pack, preferLang);
  // Backs are cheap existsSync lookups; keep them outside the index mtime cache
  // so installing `cards/back.webp` shows up without a re-sync.
  return withCatalogueBackRows(pack, faces);
}

function isFaceRow(row: CatalogueCardRow): boolean {
  return row.kind !== "pack-back" && row.kind !== "set-back";
}

/**
 * Locale-coded sleeve file (`back.ja.webp`) vs shared rarity tier (`back.hr.webp`).
 * Keep BCP-47-ish pack langs here so they never double as Kayou-style tiers.
 */
const BACK_TIER_LOCALE =
  /^(fr|en|it|de|es|pt|ptbr|pt-br|ja|jp|zh|zhcn|zhtw|ko|nl|pl|ru|sv|da|fi|no|cs|hu|ro|tr|ar|he|th|vi|id|ms)$/i;

export function catalogueBackLangFromTierSlug(slug: string): string {
  const raw = slug.trim().toLowerCase().replace(/_/g, "");
  if (!BACK_TIER_LOCALE.test(raw)) return "—";
  if (raw === "jp") return "ja";
  if (raw === "ptbr" || raw === "pt-br") return "ptbr";
  if (raw === "zhcn") return "zh";
  if (raw === "zhtw") return "zh";
  return raw;
}

/**
 * Preferred-lang browse: neutral rectos stay visible under every language;
 * language-specific rectos only under their own `lang`.
 * Backs follow the same rule: `lang === "—"` is shared; otherwise match preferLang.
 * Pack-specific axis (Carddass 巻ノ/EU/CCG) via {@link opts.localeAxis}.
 */
export function matchesCataloguePreferredLang(
  row: CatalogueCardRow,
  preferLang: string,
  opts: {
    expandLocales?: boolean;
    /**
     * Provider axis from {@link cataloguePackHooks}.matchesPreferredLocaleAxis.
     * @deprecated `narutoLocaleAxis: true` still maps to Carddass axis.
     */
    localeAxis?: (
      row: CatalogueCardRow,
      preferLang: string,
    ) => boolean;
    /** @deprecated Use {@link opts.localeAxis}. */
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
  const localeAxis =
    opts.localeAxis ??
    (opts.narutoLocaleAxis ? matchesNarutoPreferredLocaleAxis : undefined);
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
    if (localeAxis && !localeAxis(row, want)) return false;
    return true;
  }
  // Neutral + expandLocales: one tile for the preferred lang (borrowed art OK).
  if (opts.expandLocales) {
    if (row.lang.toLowerCase() !== want) return false;
    // Nameless empty invent shells (retail stub when promo holds the face).
    if ((row.missingArt || row.versoOnly) && !row.name?.trim()) return false;
    if (localeAxis && !localeAxis(row, want)) return false;
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
  /*
    UI « incomplete » checks both Sans image + Sans nom — that pair means
    art OR name gap (same as incompleteOnly), not the AND of the two flags.
  */
  if (
    filter.missingArtOnly &&
    filter.missingNameOnly &&
    !filter.incompleteOnly
  ) {
    checks.push(Boolean(row.missingArt || row.versoOnly || !row.name?.trim()));
  } else {
    if (filter.missingArtOnly) checks.push(Boolean(row.missingArt));
    if (filter.missingNameOnly) checks.push(!row.name?.trim());
  }
  if (filter.missingPriceOnly) {
    checks.push(!(typeof row.priceCents === "number" && row.priceCents > 0));
  }
  if (filter.borrowedArtOnly) {
    checks.push(Boolean(row.artFallbackFrom || row.artLocaleFrom));
  }
  // Multiple distinct audit axes (art ∩ price ∩ borrowed…) must all match.
  return checks.length === 0 ? false : checks.every(Boolean);
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

/**
 * Only borrowed-art audit still needs the full corpus (borrow markers come from
 * presentation merge, not identity SQL). `missingPriceOnly` / `incompleteOnly`
 * stay on the SQL / chunked paths.
 */
function needsFullCatalogueMaterialize(input: ListCatalogueCardsInput): boolean {
  return Boolean(input.borrowedArtOnly);
}

function localPrintDiskCard(row: LocalPrintSearchRow): string {
  return row.grouping ? `${row.number}-${row.grouping}` : row.number;
}

function localPrintRowToCatalogueCard(
  pack: CataloguePackId,
  row: LocalPrintSearchRow,
): CatalogueCardRow {
  const set = (row.setCode || row.cardType || "").trim() || "—";
  const diskCard = localPrintDiskCard(row);
  const { artUrl, artFile, missingArt } = resolveCatalogueLocalArtUrl({
    packId: pack,
    set,
    lang: row.lang,
    card: diskCard,
    sqliteArt: row.art?.trim() || row.thumb?.trim() || "",
  });
  const thumbRaw = row.thumb?.trim() || "";
  const thumbFile =
    thumbRaw && thumbRaw !== artFile && !thumbRaw.includes("/")
      ? thumbRaw
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
            pack,
            { set, lang: row.lang, card: diskCard },
            thumbFile,
          ),
        }
      : {}),
    hasFoil: false,
    label,
    ...(name ? { name } : {}),
    ...(row.rarity?.trim() ? { rarity: row.rarity.trim() } : {}),
    ...(row.printed === 0 || row.printed === false
      ? { printed: false }
      : {}),
    missingArt,
    languageSpecific: true,
    kind: "face",
  };
}

function declaredCatalogueLocales(
  pack: CataloguePackId,
): string[] | null {
  const packInfo = cataloguePackInfo(pack);
  if (packInfo?.catalogueLocales?.length) {
    return [...packInfo.catalogueLocales];
  }
  // Selector without invent shells (Carddass omits catalogueLocales).
  if (packInfo?.browseLocales?.length) {
    return [...packInfo.browseLocales];
  }
  return null;
}

function listSqlBrowseFacePage(
  input: ListCatalogueCardsInput,
  langs: readonly string[],
  offset: number,
  limit: number,
  opts?: { identityOnly?: boolean; preferLang?: string | null },
): { rows: CatalogueCardRow[]; total: number } | null {
  const packInfo = cataloguePackInfo(input.pack);
  /*
    Foil-aware SQL browse is opt-in via pack trait. Everyone else hardcodes
    hasFoil:false — honour foilOnly with an empty page, never an unfiltered
    corpus.
  */
  if (input.foilOnly && !packInfo?.foilAwareBrowse) {
    return { rows: [], total: 0 };
  }
  const pageOpts = {
    langs,
    q: input.q,
    offset,
    limit,
    missingArtOnly: input.missingArtOnly,
    missingNameOnly: input.missingNameOnly,
    incompleteOnly: input.incompleteOnly,
    foilOnly: input.foilOnly,
    printed: input.printed ?? "all",
    preferLang: opts?.preferLang ?? input.preferLang,
    localeMode: input.locales ?? "preferred",
    identityOnly: opts?.identityOnly,
  };
  const registered = listRegisteredFaceBrowsePage(input.pack, pageOpts);
  if (registered) return registered;

  const index = createLocalPrintsIndex(input.pack);
  if (!index.hasIdentityCorpus()) return null;
  const page = index.listBrowsePage({
    langs,
    q: input.q,
    offset,
    limit,
    missingArtOnly: input.missingArtOnly,
    missingNameOnly: input.missingNameOnly,
    incompleteOnly: input.incompleteOnly,
    printed: input.printed ?? "all",
  });
  return {
    total: page.total,
    rows: page.rows.map((row) =>
      localPrintRowToCatalogueCard(input.pack, row),
    ),
  };
}

/**
 * « Sans prix » without quoting the whole corpus: walk SQL pages, quote each
 * chunk, keep missing-price faces until offset+limit is filled.
 */
async function listMissingPriceCataloguePage(
  input: ListCatalogueCardsInput,
  langs: readonly string[],
  availableLocales: string[],
  offset: number,
  limit: number,
  preferLang?: string | null,
): Promise<ListCatalogueCardsResult | null> {
  const corpus = catalogueCorpusPack(input.pack);
  /*
    Probe SQL path once — packs without a page helper fall through to
    materialize. Keep counting matches past the first filled window so the
    admin total is not capped at ~pageSize (same class of bug as « 77 sans
    image »).
  */
  /*
    Price-only audits don't need disk art / Live foil on every corpus row —
    identity + quote is enough for keep/count (Pokémon FR was ~55s with full
    resolve, ~2s identity). Combined art∩price still needs full resolve.
  */
  const identityOnly =
    !input.missingArtOnly &&
    !input.missingNameOnly &&
    !input.incompleteOnly &&
    !input.borrowedArtOnly;
  const probe = listSqlBrowseFacePage(input, langs, 0, 1, {
    identityOnly,
    preferLang,
  });
  if (!probe) return null;

  const overscan = await overscanFilterPageAsync({
    offset,
    limit,
    maxScan: 50_000,
    chunk: Math.max(limit, 512),
    fetchPage: async (scanned, chunk) => {
      const page = listSqlBrowseFacePage(input, langs, scanned, chunk, {
        identityOnly,
        preferLang,
      });
      if (!page) return { rows: [], total: 0 };
      const keys = [
        ...new Set(page.rows.filter(isFaceRow).map((row) => row.printKey)),
      ];
      const priceByKey = await catalogueCardPriceQuoteByPrintKey(corpus, keys);
      return {
        rows: page.rows.map((row) => attachPriceQuote(row, priceByKey)),
        total: page.total,
      };
    },
    keep: (row) =>
      matchesCatalogueAuditFilter(row, {
        missingPriceOnly: true,
        missingArtOnly: input.missingArtOnly,
        missingNameOnly: input.missingNameOnly,
        incompleteOnly: input.incompleteOnly,
        borrowedArtOnly: input.borrowedArtOnly,
      }),
  });

  let cards = overscan.rows.map((row) =>
    hydrateRegisteredBrowseRow(input.pack, row),
  );
  if (offset === 0) {
    cards = withCatalogueBackRows(input.pack, cards);
  }
  return {
    pack: input.pack,
    total: overscan.total,
    offset,
    limit,
    cards,
    availableLocales,
  };
}

async function listSqlPagedCatalogueCards(
  input: ListCatalogueCardsInput,
  offset: number,
  limit: number,
): Promise<ListCatalogueCardsResult | null> {
  if (needsFullCatalogueMaterialize(input)) return null;
  const declared = declaredCatalogueLocales(input.pack);
  if (!declared?.length) {
    // Still try LocalPrints when pack declares no locales but has sqlite.
    if (!createLocalPrintsIndex(input.pack).hasIdentityCorpus()) return null;
  }
  const availableLocales = declared?.length
    ? [...declared]
    : [...(cataloguePackInfo(input.pack)?.catalogueLocales ?? ["fr", "en"])];

  const localeMode = input.locales ?? "preferred";
  let preferLang = input.preferLang?.trim().toLowerCase();
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
  const langs =
    localeMode === "all"
      ? availableLocales
      : preferLang
        ? [preferLang]
        : availableLocales;

  if (input.missingPriceOnly) {
    return listMissingPriceCataloguePage(
      input,
      langs,
      availableLocales,
      offset,
      limit,
      preferLang,
    );
  }

  const page = listSqlBrowseFacePage(input, langs, offset, limit, {
    preferLang,
  });
  if (!page) return null;

  // Back tiles are cheap existsSync — prepend on the first page only.
  // `total` stays face COUNT so offset/limit stay SQL-aligned.
  let cards = page.rows;
  if (offset === 0) {
    cards = withCatalogueBackRows(input.pack, cards);
  }

  const corpus = catalogueCorpusPack(input.pack);
  const pageKeys = [
    ...new Set(cards.filter(isFaceRow).map((row) => row.printKey)),
  ];
  const priceByKey = await catalogueCardPriceQuoteByPrintKey(
    corpus,
    pageKeys,
  );
  return {
    pack: input.pack,
    total: page.total,
    offset,
    limit,
    cards: cards.map((row) => attachPriceQuote(row, priceByKey)),
    availableLocales,
  };
}

export async function listCatalogueCards(
  input: ListCatalogueCardsInput,
): Promise<ListCatalogueCardsResult> {
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.min(1000, Math.max(1, Math.floor(input.limit ?? 48)));
  const sqlPage = await listSqlPagedCatalogueCards(input, offset, limit);
  if (sqlPage) return sqlPage;

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
  const expandsLocales = packInfo?.expandLocales === true;
  const hooks = cataloguePackHooks(input.pack);
  if (localeMode === "all") {
    /*
      Declared catalogueLocales are the admin surface (Pokémon = ja/fr/en).
      Live still indexes de/it/es/ptbr as separate printKeys — without this
      filter, « Toutes locales » counted every CDN lang and inflated
      « sans prix » while the dropdown only offered catalogue locales.
    */
    rows = restrictRowsToCatalogueLocales(
      rows,
      packInfo?.catalogueLocales ?? packInfo?.browseLocales,
    );
  } else if (localeMode === "preferred" && preferLang) {
    rows = rows.filter((row) =>
      matchesCataloguePreferredLang(row, preferLang!, {
        expandLocales: expandsLocales,
        localeAxis: hooks.matchesPreferredLocaleAxis,
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
  const qRaw = input.q?.trim() ?? "";
  const q = qRaw ? normalizeForTokens(qRaw) : "";
  if (q) {
    const qKey = narutoCollectorNumberKey(qRaw);
    rows = rows.filter((row) => {
      if (
        includesFolded(row.printKey, q) ||
        includesFolded(row.set, q) ||
        includesFolded(row.card, q) ||
        includesFolded(row.label, q) ||
        row.aka?.some((alias) => includesFolded(alias, q))
      ) {
        return true;
      }
      return qKey != null && qKey === catalogueCollectorKey(row.card);
    });
  }

  const corpus = catalogueCorpusPack(input.pack);
  if (input.missingPriceOnly) {
    /*
      Rows are already in memory on the materialize path — quote in chunks and
      count every missing-price match so total is not capped by page fill.
    */
    const overscan = await overscanFilterPageAsync({
      offset,
      limit,
      maxScan: rows.length,
      chunk: 200,
      fetchPage: async (scanned, chunk) => {
        const slice = rows.slice(scanned, scanned + chunk);
        const keys = [
          ...new Set(slice.filter(isFaceRow).map((row) => row.printKey)),
        ];
        const priceByKey = await catalogueCardPriceQuoteByPrintKey(
          corpus,
          keys,
        );
        return {
          rows: slice.map((row) => attachPriceQuote(row, priceByKey)),
          total: rows.length,
        };
      },
      keep: (row) =>
        matchesCatalogueAuditFilter(row, {
          missingPriceOnly: true,
          missingArtOnly: input.missingArtOnly,
          missingNameOnly: input.missingNameOnly,
          incompleteOnly: input.incompleteOnly,
          borrowedArtOnly: input.borrowedArtOnly,
        }),
    });
    return {
      pack: input.pack,
      total: overscan.total,
      offset,
      limit,
      cards: overscan.rows,
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
