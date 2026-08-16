/**
 * TCGdex — open Pokémon TCG catalogue (REST, no key). FR/EN/… locales, HD
 * artwork on `assets.tcgdex.net`, Cardmarket EUR on the card payload.
 *
 * Identity is the printed set + collector number (`pokemon:sv03.5-006`), never
 * a barcode. Effect shaders live in the `pokemon` pack (TCG Live recipes);
 * this module only supplies catalogue metadata, covers, and market prices.
 */
import { httpGet } from "@/lib/http/httpClient";

import { buildPrintKey, parsePrintKey } from "@/core/identify/printKey";
import { API_BASE } from "./api";
import { digitalOnlySetIds } from "./digitalOnly";
import { tcgdexSetSerie } from "./setMeta";

/** Game slug in every print key this provider emits (paper Pokémon TCG). */
export const POKEMON_GAME = "pokemon";

export const TCGDEX_LANGUAGES = [
  "fr",
  "en",
  "de",
  "es",
  "it",
  "pt",
  "pt-br",
  "ja",
] as const;
export type TcgdexLanguage = (typeof TCGDEX_LANGUAGES)[number];

export const TCGDEX_DEFAULT_LANGUAGE: TcgdexLanguage = "fr";

export function isTcgdexLanguage(
  value: string | null | undefined,
): value is TcgdexLanguage {
  return (
    typeof value === "string" &&
    (TCGDEX_LANGUAGES as readonly string[]).includes(value)
  );
}

/**
 * Map a Live CDN lang (`ptbr`, …) or raw TCGdex code onto our allowlist.
 * Unknown → null (caller falls back to default).
 */
export function tcgdexLanguageFromLiveOrDex(
  value: string | null | undefined,
): TcgdexLanguage | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (raw === "ptbr") return "pt-br";
  if (isTcgdexLanguage(raw)) return raw;
  return null;
}

export function resolveTcgdexLanguage(
  value: string | null | undefined,
): TcgdexLanguage {
  return tcgdexLanguageFromLiveOrDex(value) ?? TCGDEX_DEFAULT_LANGUAGE;
}

export type TcgdexVariants = {
  normal: boolean;
  holo: boolean;
  reverse: boolean;
  firstEdition: boolean;
  wPromo: boolean;
};

export type TcgdexCard = {
  /** TCGdex id, e.g. `sv03.5-006`. */
  providerId: string;
  printKey: string;
  setId: string;
  setName: string | null;
  /** Block / era name (`Soleil et Lune`) — from `/sets/{id}.serie`, not the card. */
  serieName: string | null;
  /** TCGdex serie id (`sm`, `xy`, …) when known. */
  serieId: string | null;
  /**
   * Printed set size (`cardCount.official`) — for collector labels like `11/108`.
   * Secrets use numbers above this; `setTotalCount` includes extras.
   */
  setOfficialCount: number | null;
  /** Full catalogue size including secrets / promos in the set payload. */
  setTotalCount: number | null;
  localId: string;
  language: TcgdexLanguage;
  name: string;
  rarity: string | null;
  /**
   * Evolution / card stage as TCGdex spells it (`Basic`, `Stage 1`, `BREAK`,
   * `TURBO`, …). Used for face orientation (BREAK/TURBO sit on their side).
   */
  stage: string | null;
  category: string | null;
  /** Energy / Pokémon types (`Feu`, `Fire`, …). */
  types: string[];
  hp: number | null;
  evolveFrom: string | null;
  regulationMark: string | null;
  illustrator: string | null;
  /** Finishes this print exists in — `normal`, `holo`, `reverse`, … */
  finishes: string[];
  /** CDN base without quality suffix (`…/006`). */
  imageBaseUrl: string | null;
  /** Prefer `high.png` when the CDN base is known. */
  imageUrl: string | null;
  thumbnailUrl: string | null;
  /** Cardmarket EUR cents — non-foil / normal listing. */
  cmPriceCents: number | null;
  /** Cardmarket EUR cents — holo / reverse / foil listing. */
  cmFoilPriceCents: number | null;
  cardmarketProductId: number | null;
};

type RawVariants = {
  firstEdition?: unknown;
  holo?: unknown;
  normal?: unknown;
  reverse?: unknown;
  wPromo?: unknown;
};

type RawCardmarket = {
  unit?: unknown;
  idProduct?: unknown;
  avg?: unknown;
  low?: unknown;
  trend?: unknown;
  "avg-holo"?: unknown;
  "low-holo"?: unknown;
  "trend-holo"?: unknown;
};

type RawPricing = {
  cardmarket?: RawCardmarket | null;
};

type RawSet = {
  id?: unknown;
  name?: unknown;
  cardCount?: {
    official?: unknown;
    total?: unknown;
  } | null;
};

type RawCardBrief = {
  id?: unknown;
  localId?: unknown;
  name?: unknown;
  image?: unknown;
};

type RawCardDetail = RawCardBrief & {
  category?: unknown;
  illustrator?: unknown;
  rarity?: unknown;
  stage?: unknown;
  hp?: unknown;
  types?: unknown;
  evolveFrom?: unknown;
  regulationMark?: unknown;
  set?: RawSet;
  variants?: RawVariants;
  pricing?: RawPricing;
};

function text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function positiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 ? n : null;
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

function euroToCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value * 100);
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 100);
  }
  return null;
}

function firstPositiveCents(...values: unknown[]): number | null {
  for (const value of values) {
    const cents = euroToCents(value);
    if (cents != null) return cents;
  }
  return null;
}

/** Append TCGdex CDN quality suffix (`high.png` / `low.webp`). */
export function tcgdexImageUrl(
  imageBase: string | null | undefined,
  quality: "high" | "low" = "high",
  extension: "png" | "webp" = "png",
): string | null {
  if (!imageBase?.trim()) return null;
  const base = imageBase.trim().replace(/\/+$/, "");
  return `${base}/${quality}.${extension}`;
}

function finishesFromVariants(
  variants: RawVariants | null | undefined,
): string[] {
  if (!variants || typeof variants !== "object") return [];
  const finishes: string[] = [];
  if (variants.normal === true) finishes.push("normal");
  if (variants.holo === true) finishes.push("holo");
  if (variants.reverse === true) finishes.push("reverse");
  if (variants.firstEdition === true) finishes.push("firstEdition");
  if (variants.wPromo === true) finishes.push("wPromo");
  return finishes;
}

/**
 * Cardmarket exposes `avg` for the normal listing and `avg-holo` for foil /
 * reverse. Holo-only prints put the sole price in `avg` with `avg-holo` null —
 * so we need the variant flags to decide which bucket that figure belongs in.
 */
export function cardmarketPricesFromPayload(
  pricing: RawPricing | null | undefined,
  variants?: RawVariants | null,
): {
  cmPriceCents: number | null;
  cmFoilPriceCents: number | null;
  cardmarketProductId: number | null;
} {
  const cm = pricing?.cardmarket;
  if (!cm || typeof cm !== "object") {
    return {
      cmPriceCents: null,
      cmFoilPriceCents: null,
      cardmarketProductId: null,
    };
  }

  const productId =
    typeof cm.idProduct === "number" && Number.isFinite(cm.idProduct)
      ? cm.idProduct
      : null;

  const avg = firstPositiveCents(cm.avg, cm.trend, cm.low);
  const avgHolo = firstPositiveCents(
    cm["avg-holo"],
    cm["trend-holo"],
    cm["low-holo"],
  );

  const hasNormal = variants?.normal === true;
  const hasFoil =
    variants?.holo === true ||
    variants?.reverse === true ||
    variants?.firstEdition === true ||
    variants?.wPromo === true;

  if (hasNormal && hasFoil) {
    return {
      cmPriceCents: avg,
      cmFoilPriceCents: avgHolo ?? null,
      cardmarketProductId: productId,
    };
  }

  if (hasNormal && !hasFoil) {
    // TCGdex sometimes flags a physical holo as `normal` only (e.g. XY
    // Évolutions Dracaufeu) while Cardmarket still publishes `avg-holo`. Keep
    // that foil figure so a Live `live-std` / Holofoil copy can price itself.
    return {
      cmPriceCents: avg,
      cmFoilPriceCents: avgHolo,
      cardmarketProductId: productId,
    };
  }

  // Foil-only (or unknown variants): the sole EUR figure is the foil market.
  return {
    cmPriceCents: null,
    cmFoilPriceCents: avgHolo ?? avg,
    cardmarketProductId: productId,
  };
}

export function printKeyFromTcgdexIds(
  setId: string,
  localId: string,
): string | null {
  return buildPrintKey({
    game: POKEMON_GAME,
    set: setId,
    number: localId,
  });
}

/** Rebuild the TCGdex card id from a `pokemon:…` print key. */
export function tcgdexIdFromPrintKey(
  printKey: string | null | undefined,
): string | null {
  const identity = parsePrintKey(printKey);
  if (!identity || identity.game !== POKEMON_GAME) return null;
  if (identity.grouping) {
    // TCGdex ids are set-localId only; promo groupings are not a third segment.
    return null;
  }
  return `${identity.set}-${identity.number}`;
}

export function mapTcgdexCard(
  raw: RawCardDetail,
  language: TcgdexLanguage,
): TcgdexCard | null {
  const providerId = text(raw.id);
  const localId = text(raw.localId);
  const name = text(raw.name);
  if (!providerId || !localId || !name) return null;

  const setId =
    text(raw.set?.id) ?? providerId.split("-").slice(0, -1).join("-");
  if (!setId) return null;

  const printKey = printKeyFromTcgdexIds(setId, localId);
  if (!printKey) return null;

  const imageBaseUrl = text(raw.image);
  const finishes = finishesFromVariants(raw.variants);
  const prices = cardmarketPricesFromPayload(raw.pricing, raw.variants);

  return {
    providerId,
    printKey,
    setId,
    setName: text(raw.set?.name),
    serieName: null,
    serieId: null,
    setOfficialCount: positiveInt(raw.set?.cardCount?.official),
    setTotalCount: positiveInt(raw.set?.cardCount?.total),
    localId,
    language,
    name,
    rarity: text(raw.rarity),
    stage: text(raw.stage),
    category: text(raw.category),
    types: stringList(raw.types),
    hp: positiveInt(raw.hp),
    evolveFrom: text(raw.evolveFrom),
    regulationMark: text(raw.regulationMark),
    illustrator: text(raw.illustrator),
    finishes,
    imageBaseUrl,
    imageUrl: tcgdexImageUrl(imageBaseUrl, "high", "png"),
    thumbnailUrl: tcgdexImageUrl(imageBaseUrl, "low", "webp"),
    cmPriceCents: prices.cmPriceCents,
    cmFoilPriceCents: prices.cmFoilPriceCents,
    cardmarketProductId: prices.cardmarketProductId,
  };
}

/** Brief search hit → slim card (no finishes / prices until hydrated). */
export function mapTcgdexBrief(
  raw: RawCardBrief,
  language: TcgdexLanguage,
): TcgdexCard | null {
  const providerId = text(raw.id);
  const localId = text(raw.localId);
  const name = text(raw.name);
  if (!providerId || !localId || !name) return null;

  const dash = providerId.lastIndexOf("-");
  const setId = dash > 0 ? providerId.slice(0, dash) : null;
  if (!setId) return null;

  const printKey = printKeyFromTcgdexIds(setId, localId);
  if (!printKey) return null;

  const imageBaseUrl = text(raw.image);
  return {
    providerId,
    printKey,
    setId,
    setName: null,
    serieName: null,
    serieId: null,
    setOfficialCount: null,
    setTotalCount: null,
    localId,
    language,
    name,
    rarity: null,
    stage: null,
    category: null,
    types: [],
    hp: null,
    evolveFrom: null,
    regulationMark: null,
    illustrator: null,
    finishes: [],
    imageBaseUrl,
    imageUrl: tcgdexImageUrl(imageBaseUrl, "high", "png"),
    thumbnailUrl: tcgdexImageUrl(imageBaseUrl, "low", "webp"),
    cmPriceCents: null,
    cmFoilPriceCents: null,
    cardmarketProductId: null,
  };
}

/**
 * Attach serie names from `/sets/{id}` (deduped + cached). Card payloads omit
 * the block name; without this, the picker only shows the expansion.
 */
export async function attachTcgdexSerieNames(
  cards: readonly TcgdexCard[],
  options: { language?: TcgdexLanguage; signal?: AbortSignal } = {},
): Promise<TcgdexCard[]> {
  if (cards.length === 0) return [];
  const language = options.language ?? cards[0]!.language;
  const uniqueSets = [...new Set(cards.map((c) => c.setId).filter(Boolean))];
  const metas = await Promise.all(
    uniqueSets.map(async (setId) => {
      const meta = await tcgdexSetSerie(setId, language, options.signal);
      return [setId, meta] as const;
    }),
  );
  const bySet = new Map(metas);
  return cards.map((card) => {
    const meta = bySet.get(card.setId);
    if (!meta?.serieName && !meta?.serieId) return card;
    return {
      ...card,
      serieName: meta.serieName ?? card.serieName,
      serieId: meta.serieId ?? card.serieId,
    };
  });
}

export function tcgdexPrintLabel(card: TcgdexCard): string {
  const set = card.setName ?? card.setId;
  const parts: string[] = [];
  if (card.serieName && card.serieName.toLowerCase() !== set.toLowerCase()) {
    parts.push(card.serieName);
  }
  parts.push(set);
  parts.push(tcgdexCollectorNumberLabel(card));
  return parts.join(" · ");
}

/** Printed collector number, with set size when known (`11/108`). */
export function tcgdexCollectorNumberLabel(card: TcgdexCard): string {
  const total = card.setOfficialCount;
  if (total != null) return `${card.localId}/${total}`;
  return card.localId;
}

type FetchOptions = {
  language?: TcgdexLanguage;
  signal?: AbortSignal;
};

function resolveLanguage(language?: string | null): TcgdexLanguage {
  return resolveTcgdexLanguage(language);
}

export async function fetchTcgdexCardById(
  cardId: string,
  options: FetchOptions = {},
): Promise<TcgdexCard | null> {
  const id = cardId.trim();
  if (!id) return null;
  const language = resolveLanguage(options.language);
  try {
    const response = await httpGet<RawCardDetail>(
      `${API_BASE}/${language}/cards/${encodeURIComponent(id)}`,
      { signal: options.signal, timeout: 15_000 },
    );
    const card = mapTcgdexCard(response.data, language);
    if (!card) return null;
    const [enriched] = await attachTcgdexSerieNames([card], {
      language,
      signal: options.signal,
    });
    return enriched ?? card;
  } catch {
    return null;
  }
}

export async function fetchTcgdexCardByPrintKey(
  printKey: string,
  options: FetchOptions & { name?: string | null } = {},
): Promise<TcgdexCard | null> {
  const id = tcgdexIdFromPrintKey(printKey);
  if (!id) return null;
  const card = await fetchTcgdexCardById(id, options);
  if (card) return card;

  // Fallback: name search then match print key (ids with unusual casing).
  const query = options.name?.trim();
  if (!query) return null;
  const hits = await searchTcgdexCards(query, { ...options, limit: 20 });
  return hits.find((hit) => hit.printKey === printKey.toLowerCase()) ?? null;
}

/**
 * Split `Bulbizarre 227/226`, `Carapuce A1 232` or `Ossatueur ex A1-153` into
 * the name TCGdex can match and the print the user was pointing at.
 *
 * TCGdex only searches on `name`, so a number left in the query matches nothing
 * at all. Pulled out, it is worth far more as a ranking key than as text.
 */
export function tcgdexQueryHints(query: string): {
  name: string;
  number: string | null;
  setId: string | null;
} {
  let number: string | null = null;
  let setId: string | null = null;

  const words = query.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    // `227`, `227/226`, `A1-153` — the collector number, with or without the
    // set total or the set in front of it.
    const numbered = /^(?:([A-Za-z][A-Za-z0-9.]*)-)?(\d+)(?:\/\d+)?$/.exec(
      word,
    );
    if (numbered) {
      setId ??= numbered[1] ?? null;
      number ??= numbered[2]!;
      continue;
    }
    // A bare set id: `A1`, `A1a`, `A4b`, `sv03.5`, `swshp`.
    if (/^[A-Za-z]{1,5}\d+(?:\.\d+)?[A-Za-z]?$/.test(word)) {
      setId ??= word;
      continue;
    }
    kept.push(word);
  }

  return { name: kept.join(" ") || query.trim(), number, setId };
}

/** Same number, whatever the padding: `227` is `A1-227`'s `227`. */
function sameNumber(localId: string, wanted: string): boolean {
  return (
    localId.toLowerCase() === wanted.toLowerCase() ||
    localId.replace(/^0+/, "") === wanted.replace(/^0+/, "")
  );
}

export async function searchTcgdexCards(
  query: string,
  options: FetchOptions & { limit?: number; hydrate?: boolean } = {},
): Promise<TcgdexCard[]> {
  const cleaned = query.trim();
  if (!cleaned) return [];

  const language = resolveLanguage(options.language);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const hydrate = options.hydrate !== false;
  const hints = tcgdexQueryHints(cleaned);

  // Name search is locale-scoped on TCGdex (`/fr/cards?name=charizard` → []).
  // Retry EN when the preferred locale is empty so English names still resolve
  // on a FR-default shelf.
  const languagesToTry: TcgdexLanguage[] =
    language === "en" ? ["en"] : [language, "en"];

  let briefs: RawCardBrief[] = [];
  let hitLanguage = language;
  for (const tryLang of languagesToTry) {
    try {
      const response = await httpGet<RawCardBrief[]>(
        `${API_BASE}/${tryLang}/cards`,
        {
          params: { name: hints.name },
          signal: options.signal,
          timeout: 15_000,
        },
      );
      const rows = Array.isArray(response.data) ? response.data : [];
      if (rows.length > 0) {
        briefs = rows;
        hitLanguage = tryLang;
        break;
      }
    } catch {
      if (tryLang === languagesToTry[languagesToTry.length - 1]) return [];
    }
  }

  // A shelf holds cardboard: the digital-only prints go before anything is
  // ranked, so they never take one of the `limit` seats either.
  const digitalOnly = await digitalOnlySetIds();

  // Rank *before* cutting to `limit`. TCGdex answers in catalogue order, so a
  // Pokémon's secret and Art Rare prints — the highest numbers in their set —
  // are always last: `Bulbizarre` returned 30 hits with the secret at 27, and
  // the list was cut at 24 before anyone could see it.
  const slim = briefs
    .map((row) => mapTcgdexBrief(row, hitLanguage))
    .filter((card): card is TcgdexCard => card != null)
    .filter((card) => !digitalOnly.has(card.setId.toLowerCase()))
    .map((card, index) => {
      let score = 0;
      if (hints.number && sameNumber(card.localId, hints.number)) score += 2;
      if (
        hints.setId &&
        card.setId.toLowerCase() === hints.setId.toLowerCase()
      ) {
        score += 1;
      }
      return { card, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.card);

  if (!hydrate || slim.length === 0) return slim;

  // Discovery language ≠ display language: EN name search still hydrates in the
  // preferred locale (FR by default) so shelf titles stay Dracaufeu, not Charizard.
  const detailed = await Promise.all(
    slim.map((card) =>
      fetchTcgdexCardById(card.providerId, {
        language,
        signal: options.signal,
      }),
    ),
  );

  return detailed.map((card, index) => card ?? slim[index]!).filter(Boolean);
}
