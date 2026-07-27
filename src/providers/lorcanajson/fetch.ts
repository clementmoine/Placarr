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
 */
import { httpGet } from "@/lib/http/httpClient";

import { buildPrintKey } from "@/core/identify/printKey";

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
  fullName?: unknown;
  name?: unknown;
  version?: unknown;
  rarity?: unknown;
  type?: unknown;
  color?: unknown;
  cost?: unknown;
  artists?: unknown;
  story?: unknown;
  flavorText?: unknown;
  foilTypes?: unknown;
  varnishType?: unknown;
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

  return {
    providerId,
    printKey,
    setCode,
    setName: setNames.get(setCode) ?? null,
    number,
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
 * Every print sharing this key. More than one only for the Moana / Vaiana pair,
 * which really are two cards carrying the same printed identifier.
 */
export async function fetchLorcanaCardsByPrintKey(
  printKey: string,
  options: { language?: LorcanaLanguage; signal?: AbortSignal } = {},
): Promise<LorcanaCard[]> {
  const key = printKey.trim().toLowerCase();
  if (!key) return [];
  const index = await loadLorcanaIndex(options.language, options);
  return index.byPrintKey.get(key) ?? [];
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
  if (matches.length <= 1) return matches[0] ?? null;

  const wanted = options.name ? normalizeLorcanaSearchText(options.name) : "";
  if (!wanted) return null;
  return matches.find((card) => card.searchName === wanted) ?? null;
}

export async function fetchLorcanaCardByProviderId(
  providerId: string,
  options: { language?: LorcanaLanguage; signal?: AbortSignal } = {},
): Promise<LorcanaCard | null> {
  const id = providerId.trim();
  if (!id) return null;
  const index = await loadLorcanaIndex(options.language, options);
  return index.byProviderId.get(id) ?? null;
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

export type LorcanaSearchOptions = {
  language?: LorcanaLanguage;
  signal?: AbortSignal;
  limit?: number;
};

const DEFAULT_SEARCH_LIMIT = 25;

/** Name search — the entry point for shelves that cannot scan a barcode. */
export async function searchLorcanaCards(
  query: string,
  options: LorcanaSearchOptions = {},
): Promise<LorcanaCard[]> {
  const normalized = normalizeLorcanaSearchText(query ?? "");
  if (!normalized) return [];

  const index = await loadLorcanaIndex(options.language, options);
  const scored: Array<{ card: LorcanaCard; score: number }> = [];
  for (const card of index.cards) {
    const score = scoreLorcanaCard(card, normalized);
    if (score > 0) scored.push({ card, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable, collector-meaningful order: oldest set first, then card number.
    const setDelta = compareSetCodes(a.card.setCode, b.card.setCode);
    if (setDelta !== 0) return setDelta;
    return a.card.number - b.card.number;
  });

  return scored
    .slice(0, options.limit ?? DEFAULT_SEARCH_LIMIT)
    .map((entry) => entry.card);
}

/** Numeric sets come first in release order; lettered promo sets follow. */
export function compareSetCodes(left: string, right: string): number {
  const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/.test(right) ? Number(right) : null;
  if (leftNumber != null && rightNumber != null)
    return leftNumber - rightNumber;
  if (leftNumber != null) return -1;
  if (rightNumber != null) return 1;
  return left.localeCompare(right);
}

/** Human-readable print reference, e.g. `Fabuleux · 1/9`. */
export function lorcanaPrintLabel(card: LorcanaCard): string {
  const number = `${card.number}${card.variant ?? ""}`;
  const grouping = card.promoGrouping ? ` ${card.promoGrouping}` : "";
  const set = card.setName ?? `Set ${card.setCode}`;
  return `${set} · ${number}${grouping}`;
}
