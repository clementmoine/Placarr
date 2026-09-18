/**
 * Pokémon paper-face fillers — one action file for all catalogue face sources
 * (mcdn encyclopédie, McDo tiles, TCGPlayer, pokemontcg.io, pkmcards).
 *
 * Ranking / default UI face stays in `disk/faceChoice.ts` (shared with Live index).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { DbscardsIndexEntry } from "@/providers/dragonball/shared/dbscards/list";
import {
  PKMCARDS_CARD_SITE,
  pkmcardsIndexPath,
  scrapeDbscardsIndex,
} from "@/providers/dragonball/shared/dbscards/scrapeList";

import {
  pokemonFaceFilename,
  refreshPokemonFaceDecision,
} from "../disk/faceChoice";
import { pokemonPaperCardDir } from "../disk/paperCardDisk";

/** TCGdex REST root (absorbed from former api.ts stub). */
const API_BASE = "https://api.tcgdex.net/v2";


// —— mcdnUrls.ts ——

/**
 * Official pokemon.com encyclopédie card image URLs (mcdn).
 *
 * Prefer cms3 `cards/full` (HQ when present), else cms2 `cards/web` (complete
 * but ~245×342). Locales: FR → `cms3/fr` + `cms2-fr-fr`; EN → `cms3/us` + `cms2`.
 */
export type McdnLocale = "fr" | "en";

const CMS3_BASE =
  "https://mcdn.pokemon.com/image/upload/c_limit,w_2000/f_auto/q_auto:best/v1/live/pcom-cms/static-assets/cms3";
const CMS2_BASE =
  "https://mcdn.pokemon.com/image/upload/c_limit,w_2000/f_auto/q_auto:best/v1/live/static-assets/content-assets";

export function pokemonMcdnCms3Locale(lang: McdnLocale): "fr" | "us" {
  return lang === "en" ? "us" : "fr";
}

export function pokemonMcdnCms2Bucket(lang: McdnLocale): string {
  return lang === "en" ? "cms2" : "cms2-fr-fr";
}

export function pokemonMcdnCardLangToken(lang: McdnLocale): "FR" | "EN" {
  return lang === "en" ? "EN" : "FR";
}

/** Unpadded collector number as used on pokemon.com CDN (`4`, `33`, `158`). */
export function pokemonMcdnCardNumber(localId: string | number): string {
  const raw = String(localId).trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return String(Number.parseInt(digits, 10));
}

export function pokemonMcdnCms3Url(
  galleryCode: string,
  lang: McdnLocale,
  localId: string | number,
): string {
  const code = galleryCode.trim();
  const loc = pokemonMcdnCms3Locale(lang);
  const token = pokemonMcdnCardLangToken(lang);
  const num = pokemonMcdnCardNumber(localId);
  return `${CMS3_BASE}/${loc}/img/cards/full/${code}/${code}_${token}_${num}.png`;
}

export function pokemonMcdnCms2Url(
  galleryCode: string,
  lang: McdnLocale,
  localId: string | number,
): string {
  const code = galleryCode.trim();
  const bucket = pokemonMcdnCms2Bucket(lang);
  const token = pokemonMcdnCardLangToken(lang);
  const num = pokemonMcdnCardNumber(localId);
  return `${CMS2_BASE}/${bucket}/img/cards/web/${code}/${code}_${token}_${num}.png`;
}

/** Prefer HQ cms3, then encyclopédie cms2 web. */
export function pokemonMcdnCandidateUrls(
  galleryCode: string,
  lang: McdnLocale,
  localId: string | number,
): string[] {
  return [
    pokemonMcdnCms3Url(galleryCode, lang, localId),
    pokemonMcdnCms2Url(galleryCode, lang, localId),
  ];
}

// —— mcdnGalleryCode.ts ——

/**
 * pokemon.com encyclopédie SET folder codes from Live / TCGdex stems.
 *
 * Gallery paths use codes like `SV08`, `SWSH6`, `30TH` (not Live `sv8`).
 * Irreducible aliases live in the curated ledger; mechanical padding covers
 * the common letter+digits retail pattern.
 */

export type McdnGalleryAliasLedger = {
  /** Live/TCGdex stem → encyclopédie SET folder (e.g. `30th` → `30TH`). */
  aliases?: Readonly<Record<string, string>>;
};

function curatedAliasPath(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "pokemon",
    "tcgdex",
    "curated",
    "sources",
    "mcdn-gallery.json",
  );
}

export function loadMcdnGalleryAliases(
  filePath = curatedAliasPath(),
): Readonly<Record<string, string>> {
  try {
    const raw = JSON.parse(
      readFileSync(filePath, "utf8"),
    ) as McdnGalleryAliasLedger;
    return raw.aliases ?? {};
  } catch {
    return {};
  }
}

/**
 * Candidate encyclopédie SET folders for a Live stem, highest confidence first.
 */
export function pokemonMcdnGalleryCodes(
  liveStem: string,
  aliases: Readonly<Record<string, string>> = loadMcdnGalleryAliases(),
): string[] {
  const raw = liveStem.trim().toLowerCase();
  if (!raw) return [];

  const out: string[] = [];
  const push = (code: string | null | undefined) => {
    const c = code?.trim();
    if (!c) return;
    if (!out.includes(c)) out.push(c);
  };

  push(aliases[raw]);

  // `sv3-5` → try SV03.5-style and concatenated forms later via uppercase stem.
  const plain = raw.replace(/-/g, "");
  const match = /^([a-z]+)(\d+)$/i.exec(plain);
  if (match) {
    const letters = match[1]!.toUpperCase();
    const n = Number.parseInt(match[2]!, 10);
    // SV era on pokemon.com uses zero-padded two digits (`SV08`); SWSH/SM/XY usually not.
    if (letters === "SV" || letters === "ME") {
      push(`${letters}${String(n).padStart(2, "0")}`);
    }
    push(`${letters}${n}`);
    push(`${letters}${String(n).padStart(2, "0")}`);
  }

  push(raw.toUpperCase());
  push(plain.toUpperCase());

  return out;
}

// —— pkmcardsSlug.ts ——

/**
 * pkmcards.fr Pokémon slugs — `pbl-fr-001-mega-evolution-nuit-noire-tropius`.
 *
 * Unlike DBS (`bt31-001-uc-…` / `en-bt25-009-…`), the locale sits between set
 * abbr and collector number. `dbscardsPrintRef` therefore yields null here.
 */

const LOCALE =
  "fr|en|de|it|es|pt|ja|jp|ptbr|pt-br" as const;

const SLUG_RE = new RegExp(
  `^([a-z0-9]+)-(${LOCALE})-(\\d+[a-z]*)-`,
  "i",
);

export type PkmcardsPokemonSlug = {
  /** Official abbr as on the CDN (`pbl`, `dri`). */
  setAbbr: string;
  /** Folder lang (`jp` → `ja`). */
  lang: string;
  /** Printed number without set (`001`). */
  number: string;
};

export function parsePkmcardsPokemonSlug(
  slug: string,
): PkmcardsPokemonSlug | null {
  const match = SLUG_RE.exec(slug.trim());
  if (!match) return null;
  const rawLang = match[2]!.toLowerCase();
  const lang =
    rawLang === "jp" ? "ja" : rawLang === "pt-br" ? "ptbr" : rawLang;
  return {
    setAbbr: match[1]!.toLowerCase(),
    lang,
    number: match[3]!.toLowerCase(),
  };
}

// —— pkmcardsSetMap.ts ——

/**
 * Map pkmcards official abbr (`pbl`) → local Live stem (`me5`).
 *
 * TCGdex `officialAbbr` + on-disk `data/pokemon/cards/` decide the folder.
 * No inventing stems: unmapped abbr → null (honest skip).
 */


export type PkmcardsSetResolve = {
  abbr: string;
  tcgdexId: string | null;
  liveStem: string | null;
};

type LogoSet = {
  id?: string;
  officialAbbr?: string | null;
};

function liveStems(cardsRoot: string): Set<string> {
  if (!existsSync(cardsRoot)) return new Set();
  return new Set(
    readdirSync(cardsRoot).filter((name) => {
      try {
        return statSync(path.join(cardsRoot, name)).isDirectory();
      } catch {
        return false;
      }
    }),
  );
}

function tcgdexIdCandidates(id: string): string[] {
  const raw = id.trim().toLowerCase();
  const dotted = raw.replace(/\./g, "-");
  const out = new Set<string>([raw, dotted, raw.replace(/\./g, "")]);
  // me05 → me5, sv05 → sv5 (Live folder convention)
  const me = /^me0(\d+)$/.exec(dotted);
  if (me) out.add(`me${me[1]}`);
  const sv = /^sv0(\d+)$/.exec(dotted);
  if (sv) out.add(`sv${sv[1]}`);
  const meDot = /^me0(\d+)/.exec(dotted);
  if (meDot) out.add(dotted.replace(/^me0/, "me"));
  return [...out];
}

function loadLogoSets(): LogoSet[] {
  const file = path.join(packStagingDir("pokemon"), "tcgdex-set-logos.json");
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      sets?: LogoSet[];
    };
    return Array.isArray(raw.sets) ? raw.sets : [];
  } catch {
    return [];
  }
}

/**
 * Build abbr → live stem once per process / cardsRoot.
 */
export function buildPkmcardsAbbrToLiveStem(
  cardsRoot = packCardsDir("pokemon"),
): Map<string, PkmcardsSetResolve> {
  const live = liveStems(cardsRoot);
  const map = new Map<string, PkmcardsSetResolve>();

  for (const set of loadLogoSets()) {
    const abbr = set.officialAbbr?.trim().toLowerCase();
    if (!abbr) continue;
    const tcgdexId = typeof set.id === "string" ? set.id : null;
    const candidates = [
      abbr,
      ...(tcgdexId ? tcgdexIdCandidates(tcgdexId) : []),
    ];
    const liveStem = candidates.find((c) => live.has(c)) ?? null;
    map.set(abbr, { abbr, tcgdexId, liveStem });
  }

  // Abbr that already matches a Live folder even without a logo row.
  for (const stem of live) {
    if (!map.has(stem)) {
      map.set(stem, { abbr: stem, tcgdexId: null, liveStem: stem });
    }
  }

  return map;
}

export function resolvePkmcardsAbbrToLiveStem(
  abbr: string,
  cardsRoot = packCardsDir("pokemon"),
  cache?: Map<string, PkmcardsSetResolve>,
): string | null {
  const key = abbr.trim().toLowerCase();
  if (!key) return null;
  const table = cache ?? buildPkmcardsAbbrToLiveStem(cardsRoot);
  return table.get(key)?.liveStem ?? (liveStems(cardsRoot).has(key) ? key : null);
}

// —— fillPokemontcgIo.ts ——

/**
 * Fill EN McDo faces from images.pokemontcg.io (years with CDN coverage).
 */



const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

/** TCGdex McDo set → pokemontcg.io stem. 2023/2024 absent on CDN. */
export const POKEMONTCG_MCDO_STEMS: Readonly<Record<string, string>> = {
  "2011bw": "mcd11",
  "2012bw": "mcd12",
  "2014xy": "mcd14",
  "2015xy": "mcd15",
  "2016xy": "mcd16",
  "2017sm": "mcd17",
  "2018sm": "mcd18",
  "2019sm": "mcd19",
  "2021swsh": "mcd21",
  "2022swsh": "mcd22",
};

export function pokemontcgIoMcdoImageUrl(
  stem: string,
  localId: string,
): string {
  const n = localId.replace(/\D/g, "") || localId;
  return `https://images.pokemontcg.io/${stem}/${n}_hires.png`;
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (s) => s === 200,
    });
    if (!res.data || res.data.byteLength < 500) return null;
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

export type PokemontcgFillReport = {
  setId: string;
  stem: string | null;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
};

export async function fillPokemontcgIoFacesForSet(opts: {
  setId: string;
  localIds: readonly string[];
  cardCount?: number;
  lang?: string;
  force?: boolean;
  cardsRoot?: string;
}): Promise<PokemontcgFillReport> {
  const stem = POKEMONTCG_MCDO_STEMS[opts.setId] ?? null;
  const lang = (opts.lang ?? "en").toLowerCase();
  const report: PokemontcgFillReport = {
    setId: opts.setId,
    stem,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };
  if (!stem) return report;

  for (const localId of opts.localIds) {
    report.tried += 1;
    const cardDir = pokemonPaperCardDir({
      setId: opts.setId,
      lang,
      localId,
      cardsRoot: opts.cardsRoot,
    });
    const dest = path.join(
      cardDir,
      pokemonFaceFilename("pokemontcg", "art", "png"),
    );
    if (!opts.force && existsSync(dest)) {
      report.skipped += 1;
      refreshPokemonFaceDecision(cardDir, lang);
      continue;
    }
    const buf = await download(pokemontcgIoMcdoImageUrl(stem, localId));
    if (!buf) {
      report.failed += 1;
      continue;
    }
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(dest, buf);
    refreshPokemonFaceDecision(cardDir, lang);
    report.written += 1;
  }
  return report;
}

// —— fillTcgplayer.ts ——

/**
 * EN (and other) faces from TCGPlayer CDN using TCGdex thirdParty ids.
 */




export function tcgplayerProductImageUrl(productId: number): string {
  return `https://product-images.tcgplayer.com/fit-in/1000x1000/${productId}.jpg`;
}

export function tcgplayerIdFromCardPayload(raw: {
  variants_detailed?: Array<{
    thirdParty?: { tcgplayer?: number | null };
  }> | null;
}): number | null {
  for (const row of raw.variants_detailed ?? []) {
    const id = row.thirdParty?.tcgplayer;
    if (typeof id === "number" && id > 0) return id;
  }
  return null;
}


export type TcgplayerFillReport = {
  setId: string;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
};

/**
 * For each localId in `localIds`, fetch TCGdex EN card → TCGPlayer image →
 * `art.tcgplayer.jpg` under cards/{set}/en/{num}/.
 */
export async function fillTcgplayerFacesForSet(opts: {
  setId: string;
  localIds: readonly string[];
  lang?: string;
  force?: boolean;
  cardsRoot?: string;
  fetchCard?: (tcgdexId: string) => Promise<unknown>;
  downloadImage?: (url: string) => Promise<Buffer | null>;
}): Promise<TcgplayerFillReport> {
  const lang = (opts.lang ?? "en").toLowerCase();
  const report: TcgplayerFillReport = {
    setId: opts.setId,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };

  const fetchCard =
    opts.fetchCard ??
    (async (tcgdexId: string) => {
      const res = await httpGet<Record<string, unknown>>(
        `${API_BASE}/en/cards/${encodeURIComponent(tcgdexId)}`,
        {
          headers: { "User-Agent": UA, Accept: "application/json" },
          timeout: 30_000,
          validateStatus: (s) => s === 200,
        },
      );
      return res.data;
    });
  const downloadImage = opts.downloadImage ?? download;

  for (const localId of opts.localIds) {
    report.tried += 1;
    const cardDir = pokemonPaperCardDir({
      setId: opts.setId,
      lang,
      localId,
      cardsRoot: opts.cardsRoot,
    });
    const dest = path.join(
      cardDir,
      pokemonFaceFilename("tcgplayer", "art", "jpg"),
    );
    if (!opts.force && existsSync(dest)) {
      report.skipped += 1;
      refreshPokemonFaceDecision(cardDir, lang);
      continue;
    }

    const tcgdexId = `${opts.setId}-${localId}`;
    let productId: number | null = null;
    try {
      const raw = (await fetchCard(tcgdexId)) as {
        variants_detailed?: Array<{
          thirdParty?: { tcgplayer?: number | null };
        }> | null;
      };
      productId = tcgplayerIdFromCardPayload(raw);
    } catch {
      report.failed += 1;
      continue;
    }
    if (!productId) {
      report.failed += 1;
      continue;
    }

    const buf = await downloadImage(tcgplayerProductImageUrl(productId));
    if (!buf) {
      report.failed += 1;
      continue;
    }
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(dest, buf);
    refreshPokemonFaceDecision(cardDir, lang);
    report.written += 1;
  }

  return report;
}

/** McDo 2023 — 15 cards EN via TCGPlayer. */
export async function fillTcgplayerMcdo2023(
  opts: { force?: boolean; cardsRoot?: string } = {},
): Promise<TcgplayerFillReport> {
  return fillTcgplayerFacesForSet({
    setId: "2023sv",
    localIds: Array.from({ length: 15 }, (_, i) => String(i + 1)),
    lang: "en",
    force: opts.force,
    cardsRoot: opts.cardsRoot,
  });
}

// —— fillPokemonComMcdo.ts ——

/**
 * Official pokemon.com Happy Meal McDo faces → `art.pokemoncom.png`.
 *
 * Source: mcdn marketing tiles under cms2/img/misc/_tiles/happy-meal/…
 * (news galleries). Not the encyclopédie cms3/cards/full path.
 */




export type PokemonComMcdoCampaign = {
  id: string;
  setId: string;
  lang: string;
  cardCount: number;
  pathTemplate: string;
  newsUrl?: string;
  label?: string;
};

export type PokemonComMcdoLedger = {
  source: string;
  baseUrl: string;
  campaigns: PokemonComMcdoCampaign[];
};

export type PokemonComFillReport = {
  campaignId: string;
  setId: string;
  lang: string;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
};

function pokemonComMcdoLedgerPath(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "pokemon",
    "tcgdex",
    "curated",
    "sources",
    "pokemoncom-mcdo.json",
  );
}

export function loadPokemonComMcdoLedger(
  filePath = pokemonComMcdoLedgerPath(),
): PokemonComMcdoLedger {
  return JSON.parse(readFileSync(filePath, "utf8")) as PokemonComMcdoLedger;
}

/** Fill `{nn}` with zero-padded card number (01…). */
export function pokemonComMcdoImageUrl(
  baseUrl: string,
  pathTemplate: string,
  localId: number,
): string {
  const nn = String(localId).padStart(2, "0");
  const rel = pathTemplate.replaceAll("{nn}", nn);
  return `${baseUrl.replace(/\/$/, "")}/${rel.replace(/^\//, "")}`;
}


export async function fillPokemonComMcdoCampaign(opts: {
  campaign: PokemonComMcdoCampaign;
  baseUrl: string;
  force?: boolean;
  cardsRoot?: string;
  downloadImage?: (url: string) => Promise<Buffer | null>;
}): Promise<PokemonComFillReport> {
  const lang = opts.campaign.lang.trim().toLowerCase();
  const report: PokemonComFillReport = {
    campaignId: opts.campaign.id,
    setId: opts.campaign.setId,
    lang,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };
  const downloadImage = opts.downloadImage ?? download;

  for (let n = 1; n <= opts.campaign.cardCount; n++) {
    report.tried += 1;
    const cardDir = pokemonPaperCardDir({
      setId: opts.campaign.setId,
      lang,
      localId: String(n),
      cardsRoot: opts.cardsRoot,
    });
    const outName = pokemonFaceFilename("pokemoncom", "art", "png");
    const outPath = path.join(cardDir, outName);
    if (!opts.force && existsSync(outPath)) {
      report.skipped += 1;
      refreshPokemonFaceDecision(cardDir, lang);
      continue;
    }

    const url = pokemonComMcdoImageUrl(
      opts.baseUrl,
      opts.campaign.pathTemplate,
      n,
    );
    const buf = await downloadImage(url);
    if (!buf) {
      report.failed += 1;
      continue;
    }
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(outPath, buf);
    refreshPokemonFaceDecision(cardDir, lang);
    report.written += 1;
  }

  return report;
}

export async function fillPokemonComMcdoFaces(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    ledgerPath?: string;
    downloadImage?: (url: string) => Promise<Buffer | null>;
  } = {},
): Promise<PokemonComFillReport[]> {
  const ledger = loadPokemonComMcdoLedger(opts.ledgerPath);
  const reports: PokemonComFillReport[] = [];
  for (const campaign of ledger.campaigns) {
    reports.push(
      await fillPokemonComMcdoCampaign({
        campaign,
        baseUrl: ledger.baseUrl,
        force: opts.force,
        cardsRoot: opts.cardsRoot,
        downloadImage: opts.downloadImage,
      }),
    );
  }
  return reports;
}

// —— fillPkmcards.ts ——

/**
 * Pokémon faces from pkmcards.fr list tiles → `art.pkmcards.webp`.
 *
 * Same rule as Masters dbscards: take every source face we can place. Skip only
 * when `art.pkmcards.*` is already on disk (unless `force`). Live/Coleka stay
 * preferred for display via faceChoice — this still stores the pkmcards file.
 */




const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });


export type FillPkmcardsReport = {
  lang: string;
  indexCards: number;
  tried: number;
  written: number;
  skipped: number;
  /** No Live/abbr stem mapping for this tile. */
  unmapped: number;
  failed: number;
  indexFile: string | null;
};

function loadIndex(file: string): DbscardsIndexEntry[] {
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Array.isArray(raw) ? (raw as DbscardsIndexEntry[]) : [];
  } catch {
    return [];
  }
}

export async function scrapePkmcardsCardIndex(opts: {
  lang?: string;
  maxPages?: number;
  delayMs?: number;
  force?: boolean;
} = {}): Promise<{ file: string; cards: number; pages: number }> {
  const lang = (opts.lang ?? "fr").toLowerCase();
  const file = pkmcardsIndexPath(lang);
  if (!opts.force && existsSync(file)) {
    const entries = loadIndex(file);
    if (entries.length > 0) {
      return { file, cards: entries.length, pages: 0 };
    }
  }
  const result = await scrapeDbscardsIndex({
    packId: "pokemon",
    lang,
    site: PKMCARDS_CARD_SITE,
    indexPath: file,
    maxPages: opts.maxPages ?? 700,
    delayMs: opts.delayMs ?? 300,
  });
  return { file: result.file, cards: result.cards, pages: result.pages };
}

export async function fillPkmcardsFaces(opts: {
  lang?: string;
  force?: boolean;
  /** Re-crawl list even when `pkmcards-<lang>.json` exists. */
  refreshIndex?: boolean;
  maxPages?: number;
  delayMs?: number;
  downloadDelayMs?: number;
  limit?: number;
  cardsRoot?: string;
  /** Skip network scrape; use this index file (tests). */
  indexFile?: string;
  entries?: readonly DbscardsIndexEntry[];
} = {}): Promise<FillPkmcardsReport> {
  const lang = (opts.lang ?? "fr").toLowerCase();
  const cardsRoot = opts.cardsRoot ?? packCardsDir("pokemon");
  const abbrMap = buildPkmcardsAbbrToLiveStem(cardsRoot);

  let indexFile: string | null = opts.indexFile ?? null;
  let entries: readonly DbscardsIndexEntry[] = opts.entries ?? [];

  if (!opts.entries) {
    if (opts.indexFile) {
      entries = loadIndex(opts.indexFile);
    } else {
      const scraped = await scrapePkmcardsCardIndex({
        lang,
        maxPages: opts.maxPages,
        delayMs: opts.delayMs,
        force: opts.refreshIndex ?? opts.force,
      });
      indexFile = scraped.file;
      entries = loadIndex(scraped.file);
    }
  }

  const report: FillPkmcardsReport = {
    lang,
    indexCards: entries.length,
    tried: 0,
    written: 0,
    skipped: 0,
    unmapped: 0,
    failed: 0,
    indexFile,
  };

  const delay = opts.downloadDelayMs ?? 80;
  let processed = 0;

  for (const entry of entries) {
    if (opts.limit != null && processed >= opts.limit) break;
    const parsed = parsePkmcardsPokemonSlug(entry.slug);
    if (!parsed) {
      report.unmapped += 1;
      continue;
    }
    const liveStem = resolvePkmcardsAbbrToLiveStem(
      parsed.setAbbr,
      cardsRoot,
      abbrMap,
    );
    if (!liveStem) {
      report.unmapped += 1;
      continue;
    }
    const tileLang = parsed.lang || lang;
    const cardDir = pokemonPaperCardDir({
      setId: liveStem,
      lang: tileLang,
      localId: parsed.number,
      cardsRoot,
    });
    const dest = path.join(
      cardDir,
      pokemonFaceFilename("pkmcards", "art", "webp"),
    );
    // Per-source skip — same as dbscards: other faces on disk do not block.
    if (!opts.force && existsSync(dest)) {
      report.skipped += 1;
      continue;
    }
    const url = entry.imageFront?.trim();
    if (!url) {
      report.failed += 1;
      continue;
    }
    report.tried += 1;
    processed += 1;
    if (delay > 0 && report.tried > 1) await sleep(delay);
    const buf = await download(url);
    if (!buf) {
      report.failed += 1;
      continue;
    }
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(dest, buf);
    refreshPokemonFaceDecision(cardDir, tileLang);
    report.written += 1;
  }

  return report;
}

// —— fillMcdnFaces.ts ——

/**
 * Official pokemon.com encyclopédie faces → `art.mcdn.png`.
 *
 * Tries cms3/full then cms2/web for each card. Distinct from McDo marketing
 * tiles (`art.pokemoncom.png`).
 */




export type McdnGalleryCampaign = {
  id: string;
  setId: string;
  galleryCode?: string;
  lang: string;
  /** Inclusive range `1-158` or explicit list. */
  localIds: string | readonly string[];
  label?: string;
};

export type McdnGalleryLedger = {
  source?: string;
  aliases?: Readonly<Record<string, string>>;
  campaigns: McdnGalleryCampaign[];
};

export type McdnFillReport = {
  campaignId: string;
  setId: string;
  galleryCode: string | null;
  lang: string;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
};

function mcdnGalleryLedgerPath(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "pokemon",
    "tcgdex",
    "curated",
    "sources",
    "mcdn-gallery.json",
  );
}

export function loadMcdnGalleryLedger(
  filePath = mcdnGalleryLedgerPath(),
): McdnGalleryLedger {
  return JSON.parse(readFileSync(filePath, "utf8")) as McdnGalleryLedger;
}

/** Parse `1-15` or a JSON array of ids into local id strings. */
export function parseMcdnLocalIds(
  spec: string | readonly string[],
): string[] {
  if (Array.isArray(spec)) return spec.map(String);
  const text = String(spec).trim();
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(text);
  if (range) {
    const a = Number.parseInt(range[1]!, 10);
    const b = Number.parseInt(range[2]!, 10);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return Array.from({ length: hi - lo + 1 }, (_, i) => String(lo + i));
  }
  return text
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}


export async function resolveMcdnGalleryCode(opts: {
  setId: string;
  lang: McdnLocale;
  preferred?: string | null;
  aliases?: Readonly<Record<string, string>>;
  downloadImage?: (url: string) => Promise<Buffer | null>;
}): Promise<string | null> {
  const downloadImage = opts.downloadImage ?? download;
  const aliases = opts.aliases ?? loadMcdnGalleryAliases();
  const codes = opts.preferred
    ? [opts.preferred, ...pokemonMcdnGalleryCodes(opts.setId, aliases)]
    : pokemonMcdnGalleryCodes(opts.setId, aliases);
  const seen = new Set<string>();
  for (const code of codes) {
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const buf = await downloadImage(
      pokemonMcdnCandidateUrls(code, opts.lang, 1)[1]!, // cms2 probe — complete coverage
    );
    if (buf) return code;
    const hq = await downloadImage(
      pokemonMcdnCandidateUrls(code, opts.lang, 1)[0]!,
    );
    if (hq) return code;
  }
  return null;
}

export async function fillMcdnFacesForSet(opts: {
  setId: string;
  lang: McdnLocale;
  localIds: readonly string[];
  galleryCode?: string | null;
  campaignId?: string;
  force?: boolean;
  cardsRoot?: string;
  aliases?: Readonly<Record<string, string>>;
  downloadImage?: (url: string) => Promise<Buffer | null>;
}): Promise<McdnFillReport> {
  const downloadImage = opts.downloadImage ?? download;
  const lang = opts.lang;
  const report: McdnFillReport = {
    campaignId: opts.campaignId ?? `${opts.setId}-${lang}`,
    setId: opts.setId,
    galleryCode: opts.galleryCode ?? null,
    lang,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };

  const galleryCode =
    opts.galleryCode ??
    (await resolveMcdnGalleryCode({
      setId: opts.setId,
      lang,
      aliases: opts.aliases,
      downloadImage,
    }));
  report.galleryCode = galleryCode;
  if (!galleryCode) {
    report.failed = opts.localIds.length;
    report.tried = opts.localIds.length;
    return report;
  }

  for (const localId of opts.localIds) {
    report.tried += 1;
    const cardDir = pokemonPaperCardDir({
      setId: opts.setId,
      lang,
      localId,
      cardsRoot: opts.cardsRoot,
    });
    const outName = pokemonFaceFilename("mcdn", "art", "png");
    const outPath = path.join(cardDir, outName);
    if (!opts.force && existsSync(outPath)) {
      report.skipped += 1;
      refreshPokemonFaceDecision(cardDir, lang);
      continue;
    }

    let buf: Buffer | null = null;
    for (const url of pokemonMcdnCandidateUrls(galleryCode, lang, localId)) {
      buf = await downloadImage(url);
      if (buf) break;
    }
    if (!buf) {
      report.failed += 1;
      continue;
    }
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(outPath, buf);
    refreshPokemonFaceDecision(cardDir, lang);
    report.written += 1;
  }

  return report;
}

export async function fillMcdnGalleryFaces(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    ledgerPath?: string;
    downloadImage?: (url: string) => Promise<Buffer | null>;
  } = {},
): Promise<McdnFillReport[]> {
  const ledger = loadMcdnGalleryLedger(opts.ledgerPath);
  const aliases = {
    ...loadMcdnGalleryAliases(),
    ...(ledger.aliases ?? {}),
  };
  const reports: McdnFillReport[] = [];
  for (const campaign of ledger.campaigns) {
    const lang = campaign.lang.trim().toLowerCase() as McdnLocale;
    if (lang !== "fr" && lang !== "en") continue;
    reports.push(
      await fillMcdnFacesForSet({
        setId: campaign.setId,
        lang,
        localIds: parseMcdnLocalIds(campaign.localIds),
        galleryCode: campaign.galleryCode,
        campaignId: campaign.id,
        force: opts.force,
        cardsRoot: opts.cardsRoot,
        aliases,
        downloadImage: opts.downloadImage,
      }),
    );
  }
  return reports;
}
