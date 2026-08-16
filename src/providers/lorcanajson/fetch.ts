/**
 * LorcanaJSON — the community dataset for Disney Lorcana. Static files, no API
 * and no key, published per language with official Ravensburger artwork.
 *
 * Two findings shape this module, both verified against the 6386 French and
 * English records rather than taken from the docs:
 *
 * 1. **Identity only exists in `allCards.json`.** The per-set files
 *    (`sets/setdata.N.json`) omit `setCode`, `variant` and `promoGrouping`, and
 *    `fullIdentifier` cannot be parsed back into them: it disagrees with the
 *    explicit set on some promos (`11/P3 • FR • 1` is really set 9) and older
 *    English records use a different layout entirely (`1 TFC • EN • 1/P1`).
 *    So this module reads `allCards.json` and nothing else.
 * 2. **The payload is 9 MB parsed** but only 1.6 MB on the wire thanks to gzip.
 *    We therefore parse once, keep a slim index, and let the raw payload go.
 *
 * Freshness is checked against the tiny `.md5` companion file rather than by
 * re-downloading, and at most every {@link INDEX_REVALIDATE_MS}.
 *
 * Search and lookup always walk **every** published language (preferred first).
 * A printing can exist in English only — Tempest, FreeForm2, CalendarWave —
 * and stopping at French would hide it. Deduping is by `providerId` so the
 * preferred language's title wins when the same card exists in several files.
 */
import { httpGet } from "@/lib/http/httpClient";

import { buildPrintKey, comparePrintSetCodes } from "@/core/identify/printKey";

/** Game slug used in every print key this provider emits. */
export const LORCANA_GAME = "lorcana";

const BASE_URL = "https://lorcanajson.org/files/current";

export const LORCANA_LANGUAGES = ["fr", "en", "de", "it"] as const;
export type LorcanaLanguage = (typeof LORCANA_LANGUAGES)[number];

export const LORCANA_DEFAULT_LANGUAGE: LorcanaLanguage = "fr";

/** The dataset is regenerated at most daily; a stale half hour costs nothing. */
const INDEX_REVALIDATE_MS = 30 * 60_000;

/** The payload is large — give it more room than the shared 15s default. */
const INDEX_TIMEOUT_MS = 60_000;

export type LorcanaCard = {
  /** LorcanaJSON's id. Language-independent, kept for exact re-resolution. */
  providerId: string;
  /** Provider-neutral anchor built from what is printed on the card. */
  printKey: string;
  setCode: string;
  setName: string | null;
  number: number;
  /**
   * Main-set size from `fullIdentifier` (`1/204 • FR • 1` → 204). Null on
   * promos (`20/P1`) where the second segment is not a count.
   */
  setCardCount: number | null;
  /** Distinguishes prints sharing a number, e.g. the five Dalmatian Puppies. */
  variant: string | null;
  /** Set on promos that reuse a base card's number (`20/204` vs `20/P1`). */
  promoGrouping: string | null;
  language: LorcanaLanguage;
  /** `Ariel - On Human Legs`. */
  fullName: string;
  /** `Ariel`. */
  name: string;
  /** `On Human Legs`. */
  version: string | null;
  rarity: string | null;
  cardType: string | null;
  color: string | null;
  cost: number | null;
  lore: number | null;
  strength: number | null;
  willpower: number | null;
  subtypes: string[];
  inkwell: boolean | null;
  artists: string[];
  story: string | null;
  flavorText: string | null;
  /**
   * The finishes this print exists in — `None`, `Silver`, `Satin`, `Magma`,
   * `Lava`, `VerticalWave`, `Glitter`, `RainbowPillars`. These are effect
   * names, not quality tiers. Which one you own belongs to the item, not here.
   */
  foilTypes: string[];
  /** A second, independent finish axis: `HighGloss`, `MetallicHotFoil`. */
  varnishType: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  /**
   * Alpha mask driving the holographic effect, served first-party by
   * Ravensburger. Present on roughly 97% of prints.
   */
  foilMaskUrl: string | null;
  /**
   * Artwork of the foil printing, when Ravensburger publishes a distinct file.
   * Measured against the plain one: mean channel delta 4.85/255 with peaks at
   * 250 on 4.3% of channels — a real sheen, subtle, not different art. Prefer it
   * over compositing the mask when it exists.
   */
  fullFoilUrl: string | null;
  /** Mask for the varnish axis, independent of `foilMaskUrl`. */
  varnishMaskUrl: string | null;
  /**
   * Second stamped varnish mask (`images.varnishMask2`). Two prints in the
   * game carry one; without it the second coat cannot be drawn.
   */
  secondVarnishMaskUrl: string | null;
  /**
   * Hues the stamped varnish throws (`foilEffectColors`). Index 0 is the
   * primary coat, index 1 the second. Absent on all but ~83 prints — nothing
   * else predicts them.
   */
  foilEffectColors: string[];
  cardmarketUrl: string | null;
  /** Search haystack: lowercased, unaccented, punctuation-free. */
  searchName: string;
};

type RawImages = {
  full?: unknown;
  thumbnail?: unknown;
  foilMask?: unknown;
  /** Artwork with the foil sheen baked in. Rare — 30 of 3154 French prints. */
  fullFoil?: unknown;
  /** Second, independent mask for the varnish axis. 301 prints. */
  varnishMask?: unknown;
  /** Second stamped coat mask. Two prints. */
  varnishMask2?: unknown;
};

type RawExternalLinks = {
  cardmarketUrl?: unknown;
};

type RawCard = {
  id?: unknown;
  setCode?: unknown;
  number?: unknown;
  variant?: unknown;
  promoGrouping?: unknown;
  fullIdentifier?: unknown;
  fullName?: unknown;
  name?: unknown;
  version?: unknown;
  rarity?: unknown;
  type?: unknown;
  color?: unknown;
  cost?: unknown;
  lore?: unknown;
  strength?: unknown;
  willpower?: unknown;
  subtypes?: unknown;
  inkwell?: unknown;
  artists?: unknown;
  story?: unknown;
  flavorText?: unknown;
  foilTypes?: unknown;
  varnishType?: unknown;
  foilEffectColors?: unknown;
  images?: RawImages;
  externalLinks?: RawExternalLinks;
};

type RawSet = { name?: unknown };

type RawAllCards = {
  metadata?: { generatedOn?: unknown; language?: unknown };
  sets?: Record<string, RawSet>;
  cards?: RawCard[];
};

function text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function integer(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = text(entry);
    return parsed ? [parsed] : [];
  });
}

function httpsUrl(value: unknown): string | null {
  const parsed = text(value);
  if (!parsed) return null;
  return /^https?:\/\//i.test(parsed) ? parsed : null;
}

/** Hex coats only — skip junk if upstream ever ships a named colour. */
function hexColorList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = text(entry);
    if (!parsed || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(parsed)) return [];
    return [parsed];
  });
}

/**
 * `1/204 • FR • 1` → 204. Promo tails like `20/P1` are not a set size.
 */
export function setCardCountFromFullIdentifier(
  fullIdentifier: string | null | undefined,
): number | null {
  const head = fullIdentifier?.split("•")[0]?.trim();
  if (!head) return null;
  const match = /^[^/]+\/(\d+)\s*$/.exec(head);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function optionalBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

/** Fold to a comparable form: unaccented, lowercase, alphanumeric words only. */
export function normalizeLorcanaSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isLorcanaLanguage(value: unknown): value is LorcanaLanguage {
  return (
    typeof value === "string" &&
    (LORCANA_LANGUAGES as readonly string[]).includes(value)
  );
}

function mapRawCard(
  raw: RawCard,
  language: LorcanaLanguage,
  setNames: Map<string, string>,
): LorcanaCard | null {
  const providerId = text(raw.id);
  const setCode = text(raw.setCode);
  const number = integer(raw.number);
  const fullName = text(raw.fullName);
  if (!providerId || !setCode || number == null || !fullName) return null;

  const variant = text(raw.variant);
  const promoGrouping = text(raw.promoGrouping);
  const printKey = buildPrintKey({
    game: LORCANA_GAME,
    set: setCode,
    number: `${number}${variant ?? ""}`,
    grouping: promoGrouping,
  });
  if (!printKey) return null;

  const name = text(raw.name) ?? fullName;
  const version = text(raw.version);
  const fullIdentifier = text(raw.fullIdentifier);

  return {
    providerId,
    printKey,
    setCode,
    setName: setNames.get(setCode) ?? null,
    number,
    setCardCount: setCardCountFromFullIdentifier(fullIdentifier),
    variant,
    promoGrouping,
    language,
    fullName,
    name,
    version,
    rarity: text(raw.rarity),
    cardType: text(raw.type),
    color: text(raw.color),
    cost: integer(raw.cost),
    lore: integer(raw.lore),
    strength: integer(raw.strength),
    willpower: integer(raw.willpower),
    subtypes: stringList(raw.subtypes),
    inkwell: optionalBool(raw.inkwell),
    artists: stringList(raw.artists),
    story: text(raw.story),
    flavorText: text(raw.flavorText),
    foilTypes: stringList(raw.foilTypes),
    varnishType: text(raw.varnishType),
    imageUrl: httpsUrl(raw.images?.full),
    thumbnailUrl: httpsUrl(raw.images?.thumbnail),
    foilMaskUrl: httpsUrl(raw.images?.foilMask),
    fullFoilUrl: httpsUrl(raw.images?.fullFoil),
    varnishMaskUrl: httpsUrl(raw.images?.varnishMask),
    secondVarnishMaskUrl: httpsUrl(raw.images?.varnishMask2),
    foilEffectColors: hexColorList(raw.foilEffectColors),
    cardmarketUrl: httpsUrl(raw.externalLinks?.cardmarketUrl),
    searchName: normalizeLorcanaSearchText(fullName),
  };
}

export type LorcanaIndex = {
  language: LorcanaLanguage;
  md5: string;
  generatedOn: string | null;
  cards: LorcanaCard[];
  /**
   * Several cards may share a print key: Moana and Vaiana are two physically
   * distinct cards both printed `26/P2 • 7`, a real-world ambiguity the printed
   * identifier cannot resolve.
   */
  byPrintKey: Map<string, LorcanaCard[]>;
  byProviderId: Map<string, LorcanaCard>;
};

type CachedIndex = { index: LorcanaIndex; checkedAt: number };

const indexCache = new Map<LorcanaLanguage, CachedIndex>();
/** Collapse concurrent builds — the payload is far too big to fetch twice. */
const indexBuilds = new Map<LorcanaLanguage, Promise<LorcanaIndex>>();

export function resetLorcanaIndexCache(): void {
  indexCache.clear();
  indexBuilds.clear();
}

function allCardsUrl(language: LorcanaLanguage): string {
  return `${BASE_URL}/${language}/allCards.json`;
}

async function fetchIndexMd5(
  language: LorcanaLanguage,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await httpGet<string>(`${allCardsUrl(language)}.md5`, {
      responseType: "text",
      signal,
    });
    return text(response.data);
  } catch {
    // A missing checksum must not block a lookup; fall through to a rebuild.
    return null;
  }
}

async function buildIndex(
  language: LorcanaLanguage,
  md5: string | null,
  signal?: AbortSignal,
): Promise<LorcanaIndex> {
  const response = await httpGet<RawAllCards>(allCardsUrl(language), {
    timeout: INDEX_TIMEOUT_MS,
    signal,
  });
  const payload = response.data;

  const setNames = new Map<string, string>();
  for (const [code, set] of Object.entries(payload?.sets ?? {})) {
    const name = text(set?.name);
    if (name) setNames.set(code, name);
  }

  const cards: LorcanaCard[] = [];
  const byPrintKey = new Map<string, LorcanaCard[]>();
  const byProviderId = new Map<string, LorcanaCard>();

  for (const raw of payload?.cards ?? []) {
    const card = mapRawCard(raw, language, setNames);
    if (!card) continue;
    cards.push(card);
    byProviderId.set(card.providerId, card);
    const bucket = byPrintKey.get(card.printKey);
    if (bucket) bucket.push(card);
    else byPrintKey.set(card.printKey, [card]);
  }

  return {
    language,
    md5: md5 ?? "",
    generatedOn: text(payload?.metadata?.generatedOn),
    cards,
    byPrintKey,
    byProviderId,
  };
}

/**
 * The language index, rebuilt only when the published checksum moved. Callers
 * must treat the result as read-only — it is shared between every request.
 */
export async function loadLorcanaIndex(
  language: LorcanaLanguage = LORCANA_DEFAULT_LANGUAGE,
  options: { signal?: AbortSignal } = {},
): Promise<LorcanaIndex> {
  const cached = indexCache.get(language);
  const now = Date.now();
  if (cached && now - cached.checkedAt < INDEX_REVALIDATE_MS) {
    return cached.index;
  }

  const pending = indexBuilds.get(language);
  if (pending) return pending;

  const build = (async () => {
    const md5 = await fetchIndexMd5(language, options.signal);
    const current = indexCache.get(language);
    if (current && md5 && current.index.md5 === md5) {
      // Unchanged upstream: keep the parsed index, just push the check forward.
      indexCache.set(language, { index: current.index, checkedAt: Date.now() });
      return current.index;
    }

    const index = await buildIndex(language, md5, options.signal);
    indexCache.set(language, { index, checkedAt: Date.now() });
    return index;
  })().finally(() => {
    indexBuilds.delete(language);
  });

  indexBuilds.set(language, build);
  return build;
}

/**
 * The languages to try, the preferred one first.
 *
 * Preference is not availability. A printing can exist in one language and not
 * another — Tempest, FreeForm2 and CalendarWave appear on no French card at all
 * — and the finish is a property of the *printing*, not of the text on it.
 */
export function lorcanaLanguagesToTry(
  preferred?: LorcanaLanguage,
): LorcanaLanguage[] {
  const first = preferred ?? LORCANA_DEFAULT_LANGUAGE;
  return [first, ...LORCANA_LANGUAGES.filter((lang) => lang !== first)];
}

/**
 * Every published language index, preferred first. Loads in parallel so a
 * cold search does not wait on four sequential 1.6 MB downloads.
 */
export async function loadLorcanaIndexes(
  preferred?: LorcanaLanguage,
  options: { signal?: AbortSignal } = {},
): Promise<LorcanaIndex[]> {
  return Promise.all(
    lorcanaLanguagesToTry(preferred).map((language) =>
      loadLorcanaIndex(language, options),
    ),
  );
}

/**
 * Every print sharing this key in one language index. More than one only for
 * the Moana / Vaiana pair, which really are two cards carrying the same printed
 * identifier.
 *
 * Walks every language (preferred first) and returns the first non-empty hit
 * set — an English-only C1 Tempest print must not vanish because French was
 * asked for. For storing every language's art, use
 * {@link fetchLorcanaLanguageVariants}.
 */
export async function fetchLorcanaCardsByPrintKey(
  printKey: string,
  options: { language?: LorcanaLanguage; signal?: AbortSignal } = {},
): Promise<LorcanaCard[]> {
  const key = printKey.trim().toLowerCase();
  if (!key) return [];
  for (const language of lorcanaLanguagesToTry(options.language)) {
    const index = await loadLorcanaIndex(language, options);
    const matches = index.byPrintKey.get(key) ?? [];
    if (matches.length > 0) return matches;
  }
  return [];
}

/** The single print for this key, or `null` when absent or ambiguous by name. */
export async function fetchLorcanaCardByPrintKey(
  printKey: string,
  options: {
    language?: LorcanaLanguage;
    signal?: AbortSignal;
    /** Disambiguates when a printed identifier covers several cards. */
    name?: string | null;
  } = {},
): Promise<LorcanaCard | null> {
  const matches = await fetchLorcanaCardsByPrintKey(printKey, options);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  const wanted = options.name ? normalizeLorcanaSearchText(options.name) : "";
  // Several cards share this printed identifier and nothing disambiguates
  // them — returning one at random would quietly swap Moana for Vaiana.
  if (!wanted) return null;
  return matches.find((card) => card.searchName === wanted) ?? null;
}

export async function fetchLorcanaCardByProviderId(
  providerId: string,
  options: { language?: LorcanaLanguage; signal?: AbortSignal } = {},
): Promise<LorcanaCard | null> {
  const id = providerId.trim();
  if (!id) return null;
  for (const language of lorcanaLanguagesToTry(options.language)) {
    const index = await loadLorcanaIndex(language, options);
    const card = index.byProviderId.get(id);
    if (card) return card;
  }
  return null;
}

/**
 * One row per published language for the same card (`providerId`).
 *
 * Preferred language first when present; languages that never published the
 * print are simply absent. Used so metadata can store every cover / title
 * while still defaulting the primary fields to the preferred language.
 */
export async function fetchLorcanaLanguageVariants(
  providerId: string,
  options: { language?: LorcanaLanguage; signal?: AbortSignal } = {},
): Promise<LorcanaCard[]> {
  const id = providerId.trim();
  if (!id) return [];
  const indexes = await loadLorcanaIndexes(options.language, options);
  const variants: LorcanaCard[] = [];
  for (const index of indexes) {
    const card = index.byProviderId.get(id);
    if (card) variants.push(card);
  }
  return variants;
}

/**
 * Rank a card against a normalized query. `0` means no match, and a higher
 * score is a better one: an exact name beats a prefix, which beats a substring.
 */
export function scoreLorcanaCard(card: LorcanaCard, query: string): number {
  if (!query) return 0;
  const haystack = card.searchName;
  if (haystack === query) return 100;
  // `name` alone so that "elsa" ranks Elsa's cards above "Anna and Elsa".
  const bare = normalizeLorcanaSearchText(card.name);
  if (bare === query) return 90;
  if (haystack.startsWith(`${query} `)) return 70;
  if (haystack.startsWith(query)) return 60;
  if (haystack.includes(` ${query} `) || haystack.endsWith(` ${query}`)) {
    return 40;
  }
  if (haystack.includes(query)) return 20;
  return 0;
}

/**
 * Letter codes collectors type (`TFC#1`, `ITI 4a`). Observed on English
 * printings (`1 TFC • EN • …`) and shop media paths — kept local to this
 * catalog module, not imported from a retailer.
 */
const SET_LETTER_CODES: Readonly<Record<string, string>> = {
  tfc: "1",
  rof: "2",
  iti: "3",
  ur: "4",
  urs: "4",
  ssk: "5",
  azu: "6",
  afi: "7",
  aov: "13",
};

type LorcanaSetCatalog = {
  codes: Set<string>;
  /** Normalized set name → numeric/letter set code. */
  byName: Map<string, string>;
};

export type LorcanaCollectorQuery = {
  setCode: string | null;
  number: number | null;
  variant: string | null;
  /** Uppercase promo group as stored on cards (`P1`, `P3`). */
  promoGrouping: string | null;
};

function buildSetCatalog(indexes: LorcanaIndex[]): LorcanaSetCatalog {
  const codes = new Set<string>();
  const byName = new Map<string, string>();
  for (const index of indexes) {
    for (const card of index.cards) {
      codes.add(card.setCode);
      if (!card.setName) continue;
      const name = normalizeLorcanaSearchText(card.setName);
      if (name) byName.set(name, card.setCode);
    }
  }
  return { codes, byName };
}

/** `p3` / `pr3` → `P3`. */
export function parseLorcanaPromoToken(token: string): string | null {
  const match = token
    .trim()
    .toLowerCase()
    .match(/^pr?(\d+)$/);
  return match ? `P${match[1]}` : null;
}

/** `20`, `4a` → number + optional variant letter. */
export function parseLorcanaCollectorNumber(token: string): {
  number: number;
  variant: string | null;
} | null {
  const match = token
    .trim()
    .toLowerCase()
    .match(/^(\d+)([a-z])?$/);
  if (!match) return null;
  return { number: Number(match[1]), variant: match[2] ?? null };
}

function resolveSetRef(ref: string, catalog: LorcanaSetCatalog): string | null {
  if (!ref) return null;
  if (catalog.codes.has(ref)) return ref;
  const letter = SET_LETTER_CODES[ref];
  if (letter) return letter;

  const chapter = ref.match(/^chapitre (\d+)$/);
  if (chapter?.[1] && catalog.codes.has(chapter[1])) return chapter[1];

  const exact = catalog.byName.get(ref);
  if (exact) return exact;

  // Unique word-prefix so "premier" → "premier chapitre" without matching "p".
  const hits = [...catalog.byName.entries()].filter(
    ([name]) => name === ref || name.startsWith(`${ref} `),
  );
  if (hits.length === 1) return hits[0]![1];
  return null;
}

function parseNumberPromoTokens(tokens: string[]): {
  number: number | null;
  variant: string | null;
  promoGrouping: string | null;
} | null {
  if (tokens.length === 0) {
    return { number: null, variant: null, promoGrouping: null };
  }
  if (tokens.length === 1) {
    const promo = parseLorcanaPromoToken(tokens[0]!);
    if (promo) return { number: null, variant: null, promoGrouping: promo };
    const num = parseLorcanaCollectorNumber(tokens[0]!);
    if (!num) return null;
    return { ...num, promoGrouping: null };
  }
  if (tokens.length === 2) {
    const promoFirst = parseLorcanaPromoToken(tokens[0]!);
    const numSecond = parseLorcanaCollectorNumber(tokens[1]!);
    if (promoFirst && numSecond) {
      return { ...numSecond, promoGrouping: promoFirst };
    }
    const numFirst = parseLorcanaCollectorNumber(tokens[0]!);
    const promoSecond = parseLorcanaPromoToken(tokens[1]!);
    if (numFirst && promoSecond) {
      return { ...numFirst, promoGrouping: promoSecond };
    }
  }
  return null;
}

/**
 * Collector-shaped queries: set name/code + optional number/promo.
 * `null` means the string is not print-shaped — fall back to name search only.
 */
export function parseLorcanaCollectorQuery(
  normalized: string,
  catalog: LorcanaSetCatalog,
): LorcanaCollectorQuery | null {
  if (!normalized) return null;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const setOnly = resolveSetRef(normalized, catalog);
  if (setOnly) {
    return {
      setCode: setOnly,
      number: null,
      variant: null,
      promoGrouping: null,
    };
  }

  for (let split = tokens.length - 1; split >= 1; split -= 1) {
    const setCode = resolveSetRef(tokens.slice(0, split).join(" "), catalog);
    if (!setCode) continue;
    const rest = parseNumberPromoTokens(tokens.slice(split));
    if (!rest) continue;
    return { setCode, ...rest };
  }

  // Promo without set: `P3#34`, `PR3 1`, `34 p3`.
  const promoOnly = parseNumberPromoTokens(tokens);
  if (
    promoOnly &&
    promoOnly.promoGrouping &&
    (promoOnly.number != null || tokens.length === 1)
  ) {
    return { setCode: null, ...promoOnly };
  }

  return null;
}

/**
 * Score against set / number / promo. Higher than name substrings so
 * `TFC#1` beats a card whose title happens to contain those letters.
 */
export function scoreLorcanaCollectorMatch(
  card: LorcanaCard,
  query: LorcanaCollectorQuery,
): number {
  if (query.setCode && card.setCode !== query.setCode) return 0;

  if (query.promoGrouping) {
    const cardPromo = (card.promoGrouping ?? "").toUpperCase();
    if (cardPromo !== query.promoGrouping) return 0;
  }

  if (query.number != null) {
    if (card.number !== query.number) return 0;
    if (query.variant && (card.variant ?? "").toLowerCase() !== query.variant) {
      return 0;
    }
    // Exact print when promo was asked; otherwise every print of that number.
    if (query.promoGrouping) return 99;
    if (query.variant) return 98;
    return 96;
  }

  // Set (or promo group) browse — below exact name, above loose substrings.
  if (query.setCode || query.promoGrouping) return 55;
  return 0;
}

export type LorcanaSearchOptions = {
  language?: LorcanaLanguage;
  signal?: AbortSignal;
  limit?: number;
};

const DEFAULT_SEARCH_LIMIT = 25;

/**
 * Name + collector search across every published language — preferred first.
 *
 * Dedupes by `providerId` (language-independent) so "Elsa" does not return the
 * French and English rows as two picks; the preferred language's title wins on
 * a score tie. Prints that exist in only one language (English Tempest C1s,
 * D23 FreeForm2) still surface.
 *
 * Collector queries (`premier chapitre`, `TFC#1`, `P3 34`) resolve via set
 * name / letter code / promo group — name search alone cannot find them.
 */
export async function searchLorcanaCards(
  query: string,
  options: LorcanaSearchOptions = {},
): Promise<LorcanaCard[]> {
  const normalized = normalizeLorcanaSearchText(query ?? "");
  if (!normalized) return [];

  const indexes = await loadLorcanaIndexes(options.language, options);
  const catalog = buildSetCatalog(indexes);
  const collector = parseLorcanaCollectorQuery(normalized, catalog);
  const bestByProvider = new Map<
    string,
    { card: LorcanaCard; score: number; langRank: number }
  >();

  indexes.forEach((index, langRank) => {
    for (const card of index.cards) {
      const nameScore = scoreLorcanaCard(card, normalized);
      const collectorScore = collector
        ? scoreLorcanaCollectorMatch(card, collector)
        : 0;
      const score = Math.max(nameScore, collectorScore);
      if (score <= 0) continue;
      const previous = bestByProvider.get(card.providerId);
      if (
        !previous ||
        score > previous.score ||
        (score === previous.score && langRank < previous.langRank)
      ) {
        bestByProvider.set(card.providerId, { card, score, langRank });
      }
    }
  });

  const scored = [...bestByProvider.values()];
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable, collector-meaningful order: oldest set first, then card number,
    // then print key so the base print sorts before its promo twin.
    const setDelta = comparePrintSetCodes(a.card.setCode, b.card.setCode);
    if (setDelta !== 0) return setDelta;
    if (a.card.number !== b.card.number) return a.card.number - b.card.number;
    return a.card.printKey.localeCompare(b.card.printKey);
  });

  return scored
    .slice(0, options.limit ?? DEFAULT_SEARCH_LIMIT)
    .map((entry) => entry.card);
}

/** Collector number only, e.g. `4a`, `1/204`, `20/P1`. */
export function lorcanaCollectorNumberLabel(card: LorcanaCard): string {
  const number = `${card.number}${card.variant ?? ""}`;
  if (card.promoGrouping) {
    return `${number}/${card.promoGrouping}`;
  }
  if (card.setCardCount != null) {
    return `${number}/${card.setCardCount}`;
  }
  return number;
}

/** Human-readable print reference, e.g. `Premier Chapitre · 1/204`. */
export function lorcanaPrintLabel(card: LorcanaCard): string {
  const set = card.setName ?? `Set ${card.setCode}`;
  return `${set} · ${lorcanaCollectorNumberLabel(card)}`;
}
