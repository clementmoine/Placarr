/**
 * TCGdex expansion wordmarks, keyed for pkmcards `setCode`.
 *
 * The shop stores the PTCGO / official abbreviation (`CRI`, `PRE`, `SV01`).
 * TCGdex list rows only have `id` (`me04`, `sv08.5`, `sv01`) — the official
 * abbr lives on `/sets/{id}`. Cache both so ingest can join without a
 * network hop. Pocket (`tcgp`) sets are dropped: they were never printed.
 *
 * Logo URLs on the API are a CDN *base* (`…/logo`). The file is `…/logo.png`
 * — not `…/logo/high.png` (that 404s). Same for `symbol`.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runWithConcurrency } from "@/lib/async";
import { httpGet } from "@/lib/http/httpClient";
import { foilPackDataDir } from "@/lib/runtimeData";

import { digitalOnlySetIds } from "./digitalOnly";
import { canonicalTcgdexSetId, tcgdexApiSetId } from "./localSetIds";
import { pokecardexAliasCodeForSet } from "./scrape/pokecardex/seriesCodes";

const API_BASE = "https://api.tcgdex.net/v2";

/** v2: `localizedAbbr` + rows with abbr but no TCGdex logo/symbol (ex. base1). */
const LANGUAGE = "fr";
const CACHE_VERSION = 2;
const DETAIL_CONCURRENCY = 6;

export type TcgdexSetLogoRow = {
  id: string;
  name: string | null;
  officialAbbr: string | null;
  /** Abréviation localisée TCGdex (`BAS`, `NGS`…) — parfois le code PokéCardex. */
  localizedAbbr: string | null;
  tcgOnline: string | null;
  logo: string | null;
  symbol: string | null;
};

export type TcgdexSetLogoIndex = {
  version: typeof CACHE_VERSION;
  language: typeof LANGUAGE;
  fetchedAt: string;
  sets: TcgdexSetLogoRow[];
};

type RawListItem = {
  id?: unknown;
  name?: unknown;
  logo?: unknown;
  symbol?: unknown;
};

type RawSetDetail = RawListItem & {
  abbreviation?: {
    official?: unknown;
    localized?: unknown;
    tcgOnline?: unknown;
  } | null;
};

let memory: {
  file: string;
  index: TcgdexSetLogoIndex;
  mtimeMs: number;
} | null = null;

export function tcgdexSetLogoCachePath(): string {
  return path.join(
    foilPackDataDir("pokemon"),
    "staging",
    "tcgdex-set-logos.json",
  );
}

export function __resetTcgdexSetLogoIndexForTests(): void {
  memory = null;
}

export function __seedTcgdexSetLogoIndexForTests(
  index: TcgdexSetLogoIndex,
): void {
  memory = { file: ":test:", index, mtimeMs: 0 };
}

/** TCGdex set logo/symbol base → actual PNG. Do not use `/high.png`. */
export function tcgdexSetAssetUrl(
  base: string | null | undefined,
): string | null {
  if (!base?.trim()) return null;
  const trimmed = base.trim().replace(/\/+$/, "");
  if (/\.(png|webp|jpe?g)$/i.test(trimmed)) return trimmed;
  return `${trimmed}.png`;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function isValidIndex(raw: unknown): raw is TcgdexSetLogoIndex {
  if (!raw || typeof raw !== "object") return false;
  const row = raw as TcgdexSetLogoIndex;
  return (
    (row.version === CACHE_VERSION || row.version === 1) &&
    Array.isArray(row.sets)
  );
}

/** v1 → v2 : ajoute `localizedAbbr` manquant sans re-fetch. */
function normalizeIndex(index: TcgdexSetLogoIndex): TcgdexSetLogoIndex {
  if (index.version === CACHE_VERSION) {
    return {
      ...index,
      sets: index.sets.map((row) => ({
        ...row,
        localizedAbbr: row.localizedAbbr ?? null,
      })),
    };
  }
  return {
    ...index,
    version: CACHE_VERSION,
    sets: index.sets.map((row) => ({
      ...row,
      localizedAbbr:
        (row as TcgdexSetLogoRow).localizedAbbr ?? null,
    })),
  };
}

function readIndexFile(file: string): TcgdexSetLogoIndex | null {
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return isValidIndex(parsed) ? normalizeIndex(parsed) : null;
  } catch {
    return null;
  }
}

export function loadTcgdexSetLogoIndex(
  file = tcgdexSetLogoCachePath(),
): TcgdexSetLogoIndex | null {
  if (memory && memory.file === ":test:") {
    return memory.index;
  }
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    mtimeMs = 0;
  }
  if (memory && memory.file === file && memory.mtimeMs === mtimeMs) {
    return memory.index;
  }
  const index = readIndexFile(file);
  if (index) memory = { file, index, mtimeMs };
  else memory = null;
  return index;
}

function codesOf(row: TcgdexSetLogoRow): string[] {
  const ids = [
    row.id,
    row.officialAbbr,
    row.localizedAbbr,
    row.tcgOnline,
    // Local catalogue id ↔ API oddball (`me05.5` ↔ `30th`).
    canonicalTcgdexSetId(row.id),
    tcgdexApiSetId(row.id),
  ];
  return [
    ...new Set(
      ids
        .filter((value): value is string => Boolean(value))
        .map(normalizeCode),
    ),
  ];
}

/**
 * Unique match on TCGdex id *or* official / TCGO abbreviation.
 * Several hits or none → null (honest empty, never a coin-flip logo).
 */
export function tcgdexLogoUrlForSetCode(
  setCode: string | null | undefined,
  index: TcgdexSetLogoIndex | null | undefined,
): string | null {
  const row = tcgdexSetRowForCode(setCode, index);
  return row?.logo ?? row?.symbol ?? null;
}

/**
 * Candidats symbole check-list (glyphe, pas le wordmark), ordre de préférence.
 *
 * PokéCardex est plus lisible en 24px, mais ses codes ne matchent pas toujours
 * l'abbr PTCGO (`N1` 404 alors que `NG` existe ; `RO` vs `TR`). On enchaîne :
 * PokéCardex (abbr) → TCGdex symbole `fr`/`en` → glyphe d'ère / PROMO →
 * symbole synthétisé / mate d'ère → wordmark. Le client bascule au `onError`.
 *
 * Même sans ligne d'index (ex. `exu` : pas d'asset FR listé, symbole EN ok).
 */
export function tcgdexSetSymbolCandidates(
  setCode: string | null | undefined,
  index: TcgdexSetLogoIndex | null | undefined = loadTcgdexSetLogoIndex(),
): string[] {
  const row = tcgdexSetRowForCode(setCode, index);
  const catalogueId = (
    canonicalTcgdexSetId(setCode) ??
    setCode ??
    row?.id
  )
    ?.trim()
    .toLowerCase();
  if (!catalogueId) return [];
  const out: string[] = [];
  const push = (url: string | null | undefined) => {
    const trimmed = url?.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  };
  // Curated PokéCardex `nom_court` (kits `TK1-LA`) before TCGdex abbr (`TK1A` 404).
  push(pokecardexSymbolUrl(pokecardexAliasCodeForSet(catalogueId)));
  if (row) {
    push(pokecardexSymbolUrl(row.officialAbbr));
    push(pokecardexSymbolUrl(row.localizedAbbr));
    push(pokecardexSymbolUrl(row.tcgOnline));
    for (const url of tcgdexLocaleAssetUrls(row.symbol)) push(url);
  }
  // Kits / promos / sets hors index : glyphe d'ère ou PROMO.
  push(pokecardexSymbolUrl(pokecardexFallbackGlyphCode(catalogueId)));
  // Galeries / Classic Collection : symbole du set parent avant le synth local
  // (souvent 404 : `swsh9.5tg` → `swsh9` / BRS).
  for (const url of tcgdexParentSetSymbolUrls(catalogueId, index)) push(url);
  // URL CDN TCGdex sous l'id API (`30th`, pas `me05.5`) — même sans symbole indexé.
  for (const url of tcgdexSynthesizedSymbolUrls(catalogueId)) push(url);
  // Kits SM etc. : pas de glyphe PokéCardex → symbole d'une extension de l'ère.
  for (const url of tcgdexEraMateSymbolUrls(catalogueId, index)) push(url);
  if (row) {
    for (const url of tcgdexLocaleAssetUrls(row.logo)) push(url);
  }
  return out;
}

/**
 * `assets.tcgdex.net/{lang}/{serie}/{apiSetId}/symbol.png` — utile quand l'API
 * n'expose pas le symbole mais que le CDN le sert (30ᵉ → `30th`, Zarbi `exu`).
 */
export function tcgdexSynthesizedSymbolUrls(setId: string): string[] {
  const local = (canonicalTcgdexSetId(setId) ?? setId).trim().toLowerCase();
  if (!local) return [];
  const api = (tcgdexApiSetId(local) ?? local).trim().toLowerCase();
  const era = symbolEraKey(local);
  if (!era) return [];
  const serie = local.startsWith("tk-") ? "tk" : era;
  return tcgdexLocaleAssetUrls(
    `https://assets.tcgdex.net/univ/${serie}/${api}/symbol`,
  );
}

/**
 * Sous-sets (Galerie d'entraîneur, Classic Collection) → ids parents à tenter
 * pour un symbole déjà indexé / CDN (`swsh12.5gg` → `swsh12.5`, `me05.5c` → `me05.5`).
 */
export function tcgdexParentSetIds(setId: string): string[] {
  const id = setId.trim().toLowerCase();
  if (!id) return [];
  const out: string[] = [];
  const push = (value: string) => {
    const v = value.trim().toLowerCase();
    if (v && v !== id && !out.includes(v)) out.push(v);
  };
  // `me05.5c` / `30th-c` → `me05.5` / `30th`
  const classic = id.match(/^(.*\d(?:\.\d+)?)c$/);
  if (classic?.[1]) push(classic[1]);
  if (id.endsWith("-c") && id.length > 2) push(id.slice(0, -2));
  // `cel25cc` → `cel25`
  if (id.endsWith("cc") && id.length > 2) push(id.slice(0, -2));
  // `swsh9.5tg` / `swsh12.5gg` → `swsh9.5` / `swsh12.5` puis main `swsh9`
  const gallery = id.match(/^(.*)(tg|gg)$/);
  if (gallery?.[1]) {
    const stem = gallery[1].replace(/\.$/, "");
    push(stem);
    if (stem.endsWith(".5")) push(stem.slice(0, -2));
  }
  return out;
}

/** Symboles / logos du set parent (index + synth CDN). */
export function tcgdexParentSetSymbolUrls(
  setId: string,
  index: TcgdexSetLogoIndex | null | undefined,
): string[] {
  const out: string[] = [];
  const pushAll = (urls: string[]) => {
    for (const url of urls) {
      if (!out.includes(url)) out.push(url);
    }
  };
  const parents = tcgdexParentSetIds(setId);
  // Prefers indexed parents (`swsh9`) before synth of missing stems (`swsh9.5`).
  for (const parent of parents) {
    const row = tcgdexSetRowForCode(parent, index);
    if (!row) continue;
    pushAll(
      [
        pokecardexSymbolUrl(row.officialAbbr),
        pokecardexSymbolUrl(row.localizedAbbr),
        pokecardexSymbolUrl(row.tcgOnline),
      ].filter((u): u is string => Boolean(u)),
    );
    if (row.symbol) pushAll(tcgdexLocaleAssetUrls(row.symbol));
    if (row.logo) pushAll(tcgdexLocaleAssetUrls(row.logo));
  }
  for (const parent of parents) {
    const row = tcgdexSetRowForCode(parent, index);
    if (row?.symbol) continue;
    pushAll(tcgdexSynthesizedSymbolUrls(parent));
  }
  return out;
}

/** Premier candidat — préférer `tcgdexSetSymbolCandidates` + fallback UI. */
export function tcgdexSetSymbolUrl(
  setCode: string | null | undefined,
  index: TcgdexSetLogoIndex | null | undefined = loadTcgdexSetLogoIndex(),
): string | null {
  return tcgdexSetSymbolCandidates(setCode, index)[0] ?? null;
}

/**
 * TCGdex sert les assets sous `/{lang}/…` — le segment `univ` répond 400.
 * Certaines locales 404 (ex. `basep` FR) alors que `en` existe.
 */
export function tcgdexLocaleAssetUrls(
  base: string | null | undefined,
  languages: readonly string[] = ["fr", "en"],
): string[] {
  const raw = base?.trim();
  if (!raw) return [];
  const withFile = /\.(png|webp|jpe?g)$/i.test(raw)
    ? raw
    : `${raw.replace(/\/+$/, "")}.png`;
  const out: string[] = [];
  for (const language of languages) {
    const lang = language.trim().toLowerCase() || "fr";
    const url = withFile.replace(
      /^(https?:\/\/assets\.tcgdex\.net\/)(?:univ|[a-z]{2})(\/)/i,
      `$1${lang}$2`,
    );
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

/**
 * TCGdex sert les symboles sous `/{lang}/…/symbol.png` — le segment `univ`
 * renvoyé par l'API répond 400. Réécrit vers `fr` (catalogue FR).
 */
export function tcgdexWorkingSymbolUrl(
  symbol: string | null | undefined,
  language = "fr",
): string | null {
  return tcgdexLocaleAssetUrls(symbol, [language])[0] ?? null;
}

/**
 * Glyphe PokéCardex de secours quand le set n'a pas son propre symbole CDN.
 * Kits → code d'ère (`EX`, `XY`, `HGSS`) ; promos Black Star / Nintendo → `PROMO` ;
 * McDo → `MC3` / `M23` (codes série PokéCardex).
 */
export function pokecardexFallbackGlyphCode(
  setId: string | null | undefined,
): string | null {
  const id = setId?.trim().toLowerCase();
  if (!id) return null;
  const kit = id.match(/^tk-([a-z]+)/);
  if (kit?.[1]) {
    // Aligné sur `tcgdexEraKey` : ligne HS → sets `hgss*`.
    if (kit[1] === "hs") return "HGSS";
    return kit[1].toUpperCase();
  }
  // `2013bw` → MC3 ; `2023sv` → M23 (pages pokecardex.com/series/…).
  const mcdonalds = id.match(/^(\d{4})([a-z]+)/);
  if (mcdonalds?.[1]) {
    const year = Number(mcdonalds[1]);
    if (year >= 2023) return `M${year % 100}`;
    if (year >= 2011 && year <= 2019) return `MC${year - 2010}`;
  }
  if (id === "np" || id === "basep") return "PROMO";
  // `bwp` / `swshp` / `hgssp`… — pas `pop1`.
  if (/^[a-z]{2,}p$/.test(id) && !id.startsWith("pop")) return "PROMO";
  // Sous-collection lettre (`exu`) → glyphe d'ère (`EX`).
  const letterSub = id.match(/^([a-z]{2,3})[a-z]$/);
  if (letterSub?.[1] && !/\d/.test(id)) {
    const prefix = letterSub[1];
    if (prefix !== "ne" && prefix !== "po") return prefix.toUpperCase();
  }
  return null;
}

/**
 * Quand un set n'a pas d'asset propre : symbole TCGdex d'une extension papier
 * de la même ère (ex. `me05.5` / `tk-sm-l` → `me01` / `sm1`), observé dans
 * l'index — pas une URL inventée.
 */
export function tcgdexEraMateSymbolUrls(
  setId: string,
  index: TcgdexSetLogoIndex | null | undefined,
): string[] {
  if (!index) return [];
  const era = symbolEraKey(setId);
  if (!era) return [];
  const out: string[] = [];
  const pushAll = (urls: string[]) => {
    for (const url of urls) {
      if (!out.includes(url)) out.push(url);
    }
  };
  for (const row of index.sets) {
    if (row.id === setId || /^tk-/i.test(row.id)) continue;
    if (symbolEraKey(row.id) !== era) continue;
    // Prefer a numbered main set (`me01`) over promo/energy (`mep`, `mee`).
    if (/^[a-z]{2,}[ep]$/i.test(row.id) && !/\d/.test(row.id)) continue;
    if (row.symbol) {
      pushAll(tcgdexLocaleAssetUrls(row.symbol));
      return out;
    }
  }
  // Dernier recours : wordmark d'une extension de l'ère.
  for (const row of index.sets) {
    if (row.id === setId || /^tk-/i.test(row.id)) continue;
    if (symbolEraKey(row.id) !== era) continue;
    if (/^[a-z]{2,}[ep]$/i.test(row.id) && !/\d/.test(row.id)) continue;
    if (row.logo) {
      pushAll(tcgdexLocaleAssetUrls(row.logo));
      return out;
    }
  }
  return out;
}

/** Même logique que `tcgdexEraKey` — locale pour éviter un import sqlite. */
function symbolEraKey(setId: string): string | null {
  const id = setId.trim().toLowerCase();
  if (!id) return null;
  const kit = id.match(/^tk-([a-z]+)/);
  if (kit?.[1]) return kit[1] === "hs" ? "hgss" : kit[1];
  const mcdonalds = id.match(/^\d{4}([a-z]+)/);
  if (mcdonalds?.[1]) return mcdonalds[1];
  const promo = id.match(/^([a-z]{2,})p$/);
  if (promo?.[1] && promo[1] !== "po" && id !== "np") return promo[1];
  // Énergies d'ère : `sve`→`sv`, `mee`→`me`.
  const energy = id.match(/^([a-z]{2,})e$/);
  if (energy?.[1] && !/\d/.test(id)) return energy[1];
  // Sous-collections lettre : `exu` (Zarbi) → `ex`.
  const letterSub = id.match(/^([a-z]{2,3})[a-z]$/);
  if (letterSub?.[1] && !/\d/.test(id)) {
    const prefix = letterSub[1];
    if (prefix !== "ne" && prefix !== "po") return prefix;
  }
  const main = id.match(/^([a-z]+)/);
  return main?.[1] ?? null;
}

/**
 * `PRE` → `https://pokecardex.b-cdn.net/assets/images/symboles/PRE.png`.
 * Abréviations composées PTCGO (`CEL:CC`, `CRZ:GG`) → stem avant `:` (`CEL`).
 */
export function pokecardexSymbolUrl(
  officialAbbr: string | null | undefined,
): string | null {
  const raw = officialAbbr?.trim().toUpperCase();
  if (!raw) return null;
  // Plain (`PRE`) or hyphenated kit codes (`TK1-LA`).
  if (/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(raw)) {
    return `https://pokecardex.b-cdn.net/assets/images/symboles/${raw}.png`;
  }
  // Compound PTCGO only (`CEL:CC`) — ignore free-form labels with spaces.
  if (/^[A-Z0-9]+[:/][A-Z0-9]+$/.test(raw)) {
    const stem = raw.split(/[:/]/)[0]!;
    return `https://pokecardex.b-cdn.net/assets/images/symboles/${stem}.png`;
  }
  return null;
}

/** Attache `iconUrl` / `iconUrls` (symbole) — sans écraser un icon déjà là. */
export function withTcgdexSetSymbols<
  T extends { id: string; iconUrl?: string; iconUrls?: string[] },
>(
  sets: readonly T[],
  index: TcgdexSetLogoIndex | null | undefined = loadTcgdexSetLogoIndex(),
): T[] {
  return sets.map((set) => {
    if (set.iconUrl?.trim() || set.iconUrls?.some((u) => u?.trim())) return set;
    const iconUrls = tcgdexSetSymbolCandidates(set.id, index);
    if (!iconUrls.length) return set;
    return { ...set, iconUrl: iconUrls[0], iconUrls };
  });
}

/** Shop abbr (`CRI`) → catalogue id (`me04`). Unique hit only. */
export function tcgdexCatalogueSetIdForCode(
  setCode: string | null | undefined,
  index: TcgdexSetLogoIndex | null | undefined,
): string | null {
  return tcgdexSetRowForCode(setCode, index)?.id ?? null;
}

function tcgdexSetRowForCode(
  setCode: string | null | undefined,
  index: TcgdexSetLogoIndex | null | undefined,
): TcgdexSetLogoRow | null {
  const needle = setCode?.trim();
  if (!needle || !index) return null;
  const key = normalizeCode(needle);
  const aliases = [
    ...new Set(
      [key, canonicalTcgdexSetId(key), tcgdexApiSetId(key)]
        .filter((value): value is string => Boolean(value))
        .map(normalizeCode),
    ),
  ];
  const hits = index.sets.filter((row) =>
    aliases.some((alias) => codesOf(row).includes(alias)),
  );
  if (hits.length !== 1) return null;
  return hits[0]!;
}

const SET_NAME_SKIP = new Set([
  "le",
  "la",
  "les",
  "l",
  "the",
  "un",
  "une",
  "a",
  "an",
  "et",
  "and",
  "de",
  "des",
  "du",
  "d",
]);

/** Fold accents / `&` so « Noir & Blanc » meets slug `noir-et-blanc`. */
export function normalizeTcgdexSetText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tcgdexSetNameWords(name: string): string[] {
  return normalizeTcgdexSetText(name)
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !SET_NAME_SKIP.has(word));
}

/**
 * Logo for a sealed SKU: abbr first, then unique set-name words in slug/title.
 *
 * Displays often have no `setCode` — only `boite-36-…-faille-paradoxe`. Prefer
 * the set whose **significant** name words all appear, then the densest match,
 * then the rightmost one (series block « Écarlate et Violet » before the set).
 * Dual products (« Foudre Noire & Flamme Blanche ») stay empty.
 */
export function tcgdexLogoUrlForProduct(input: {
  setCode?: string | null;
  slug?: string | null;
  name?: string | null;
  index?: TcgdexSetLogoIndex | null;
}): string | null {
  const row = tcgdexSetRowForProduct(input);
  return row?.logo ?? row?.symbol ?? null;
}

/** Shop abbr / slug / name → TCGdex set id for sealed lottery expansion. */
export function tcgdexCatalogueSetIdForProduct(input: {
  setCode?: string | null;
  slug?: string | null;
  name?: string | null;
  index?: TcgdexSetLogoIndex | null;
}): string | null {
  return tcgdexSetRowForProduct(input)?.id ?? null;
}

function tcgdexSetRowForProduct(input: {
  setCode?: string | null;
  slug?: string | null;
  name?: string | null;
  index?: TcgdexSetLogoIndex | null;
}): TcgdexSetLogoRow | null {
  const byCode = tcgdexSetRowForCode(input.setCode, input.index);
  if (byCode) return byCode;
  const index = input.index;
  if (!index?.sets.length) return null;

  const hay = normalizeTcgdexSetText(
    [input.slug, input.name].filter(Boolean).join(" "),
  );
  if (!hay) return null;

  type Hit = { row: TcgdexSetLogoRow; wordCount: number; lastPos: number };
  const hits: Hit[] = [];
  for (const row of index.sets) {
    if (!row.logo && !row.symbol) continue;
    const name = row.name?.trim();
    if (!name) continue;
    const words = tcgdexSetNameWords(name);
    if (words.length === 0) continue;
    if (!words.every((word) => hay.includes(word))) continue;
    const lastPos = Math.max(...words.map((word) => hay.lastIndexOf(word)));
    hits.push({ row, wordCount: words.length, lastPos });
  }
  if (hits.length === 0) return null;

  const nameHay = normalizeTcgdexSetText(input.name ?? "");
  if (
    nameHay &&
    (input.name?.includes("&") || /\s+et\s+/i.test(input.name ?? ""))
  ) {
    const inName = hits.filter((hit) => {
      const words = tcgdexSetNameWords(hit.row.name ?? "");
      return words.length >= 2 && words.every((word) => nameHay.includes(word));
    });
    if (new Set(inName.map((hit) => hit.row.id)).size > 1) return null;
  }

  hits.sort(
    (a, b) => b.wordCount - a.wordCount || b.lastPos - a.lastPos,
  );
  const best = hits[0]!;
  const tied = hits.filter(
    (hit) =>
      hit.wordCount === best.wordCount && hit.lastPos === best.lastPos,
  );
  if (new Set(tied.map((hit) => hit.row.id)).size > 1) return null;
  return best.row;
}

function mapRow(
  brief: RawListItem,
  detail: RawSetDetail | null,
): TcgdexSetLogoRow | null {
  const id = text(detail?.id) ?? text(brief.id);
  if (!id) return null;
  const logo = tcgdexSetAssetUrl(text(detail?.logo) ?? text(brief.logo));
  const symbol = tcgdexSetAssetUrl(text(detail?.symbol) ?? text(brief.symbol));
  const abbr = detail?.abbreviation;
  const officialAbbr =
    abbr && typeof abbr === "object" ? text(abbr.official) : null;
  const localizedAbbr =
    abbr && typeof abbr === "object" ? text(abbr.localized) : null;
  const tcgOnline =
    abbr && typeof abbr === "object" ? text(abbr.tcgOnline) : null;
  // Set de Base n'a ni logo ni symbole TCGdex, mais `BS` existe chez PokéCardex.
  if (!logo && !symbol && !officialAbbr && !localizedAbbr && !tcgOnline) {
    return null;
  }
  return {
    id,
    name: text(detail?.name) ?? text(brief.name),
    officialAbbr,
    localizedAbbr,
    tcgOnline,
    logo,
    symbol,
  };
}

async function fetchSetDetail(id: string): Promise<RawSetDetail | null> {
  try {
    const response = await httpGet<RawSetDetail>(
      `${API_BASE}/${LANGUAGE}/sets/${encodeURIComponent(id)}`,
      { timeout: 15_000 },
    );
    return response.data ?? null;
  } catch {
    return null;
  }
}

export async function refreshTcgdexSetLogoIndex(opts?: {
  force?: boolean;
  dest?: string;
}): Promise<TcgdexSetLogoIndex> {
  const dest = opts?.dest ?? tcgdexSetLogoCachePath();
  if (!opts?.force) {
    const existing = loadTcgdexSetLogoIndex(dest);
    if (existing && existing.sets.length > 0) return existing;
  }

  const pocket = await digitalOnlySetIds();
  const list = await httpGet<RawListItem[]>(`${API_BASE}/${LANGUAGE}/sets`, {
    timeout: 20_000,
  });
  const briefs = Array.isArray(list.data) ? list.data : [];
  // Tous les sets papier : l'abbr (et donc PokéCardex) n'est que sur le détail,
  // y compris quand la liste n'a ni logo ni symbole (Set de Base).
  const wanted = briefs.filter((brief) => {
    const id = text(brief.id);
    if (!id) return false;
    return !pocket.has(id.toLowerCase());
  });

  const rows = await runWithConcurrency(
    wanted,
    DETAIL_CONCURRENCY,
    async (brief) => {
      const id = text(brief.id);
      if (!id) return null;
      const detail = await fetchSetDetail(id);
      return mapRow(brief, detail);
    },
  );

  const index: TcgdexSetLogoIndex = {
    version: CACHE_VERSION,
    language: LANGUAGE,
    fetchedAt: new Date().toISOString(),
    sets: rows.filter((row): row is TcgdexSetLogoRow => Boolean(row)),
  };
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(dest).mtimeMs;
  } catch {
    mtimeMs = Date.now();
  }
  memory = { file: dest, index, mtimeMs };
  return index;
}

/** Refresh for a Pokémon extract. Failure → keep the on-disk cache if any. */
export async function ensureTcgdexSetLogoIndex(opts?: {
  force?: boolean;
  dest?: string;
}): Promise<TcgdexSetLogoIndex | null> {
  try {
    return await refreshTcgdexSetLogoIndex(opts);
  } catch {
    return loadTcgdexSetLogoIndex(opts?.dest ?? tcgdexSetLogoCachePath());
  }
}
