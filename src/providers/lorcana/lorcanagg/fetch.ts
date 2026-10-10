/**
 * DotGG / lorcana.gg — Cardmarket EUR dump for Disney Lorcana.
 *
 * Full catalog via `api.dotgg.gg/cgfw/getcards?game=lorcana` (~4 MB). Cached
 * as a compact price index in provider evidence so refresh jobs do not re-pull
 * the dump for every card.
 */
import { httpGet } from "@/lib/http/httpClient";
import {
  getFreshProviderEvidence,
  putProviderEvidence,
} from "@/core/enrich/providerEvidenceStore";

import {
  dotggIndexKey,
  dotggLookupFromPrintKey,
  type DotggLookup,
} from "./match";

const PROVIDER_ID = "lorcanagg";
const CARDS_URL = "https://api.dotgg.gg/cgfw/getcards?game=lorcana";
const EVIDENCE_KIND = "dotggLorcanaPrices";

/** Prices move daily; a half-day dump is enough between refresh waves. */
export const DOTGG_PRICE_TTL_MS = 12 * 60 * 60 * 1000;

const BROWSER_UA =
  "Mozilla/5.0 (compatible; Placarr/1.0; +https://github.com/) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

/** Index tenu en mémoire après un chargement (check-list : N lookups / requête). */
let memoryIndex: DotggPriceIndex | null = null;
let memoryIndexLoadedAt = 0;

export type DotggCardPrices = {
  id: string;
  setId: string;
  number: string;
  name: string;
  title: string | null;
  rarity: string | null;
  slug: string | null;
  /** EUR cents — Cardmarket lowest non-foil (or sole listing). */
  cmPriceCents: number | null;
  /** EUR cents — Cardmarket foil. */
  cmFoilPriceCents: number | null;
  sourceUrl: string | null;
};

export type DotggPriceIndex = Record<string, DotggCardPrices>;

type RawDotggCard = {
  id?: unknown;
  setId?: unknown;
  number?: unknown;
  name?: unknown;
  title?: unknown;
  displayName?: unknown;
  rarity?: unknown;
  slug?: unknown;
  cmPrice?: unknown;
  cmFoilPrice?: unknown;
  cmurl?: unknown;
  cmid?: unknown;
  cardmarketId?: unknown;
};

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function euroToCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value * 100);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed * 100);
    }
  }
  return null;
}

export function mapDotggCard(raw: RawDotggCard): DotggCardPrices | null {
  const setId = text(raw.setId)?.toUpperCase() ?? null;
  const number = text(raw.number)?.toLowerCase() ?? null;
  const id = text(raw.id);
  const name = text(raw.name);
  if (!setId || !number || !id || !name) return null;

  const cmid =
    typeof raw.cmid === "number"
      ? raw.cmid
      : typeof raw.cardmarketId === "number"
        ? raw.cardmarketId
        : null;
  const cmurl = text(raw.cmurl);
  const sourceUrl =
    cmurl ||
    (cmid != null
      ? `https://www.cardmarket.com/en/Lorcana/Products/Search?searchString=${encodeURIComponent(name)}`
      : text(raw.slug)
        ? `https://lorcana.gg/cards/${text(raw.slug)}`
        : "https://lorcana.gg/cards/");

  return {
    id,
    setId,
    number,
    name,
    title: text(raw.title),
    rarity: text(raw.rarity),
    slug: text(raw.slug),
    cmPriceCents: euroToCents(raw.cmPrice),
    cmFoilPriceCents: euroToCents(raw.cmFoilPrice),
    sourceUrl,
  };
}

/** Build the lookup index from a raw getcards payload (array or `{ data: [] }`). */
export function priceIndexFromDotggCards(payload: unknown): DotggPriceIndex {
  const rows = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];

  const index: DotggPriceIndex = {};
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const card = mapDotggCard(row as RawDotggCard);
    if (!card) continue;
    if (card.cmPriceCents == null && card.cmFoilPriceCents == null) continue;
    index[dotggIndexKey(card.setId, card.number)] = card;
  }
  return index;
}

export function lookupDotggCard(
  index: DotggPriceIndex,
  lookup: DotggLookup,
): DotggCardPrices | null {
  return index[dotggIndexKey(lookup.setId, lookup.number)] ?? null;
}

export function dotggCardLabel(card: DotggCardPrices): string {
  return card.title ? `${card.name} - ${card.title}` : card.name;
}

let inFlight: Promise<DotggPriceIndex> | null = null;

async function fetchDotggCardsPayload(signal?: AbortSignal): Promise<unknown> {
  const response = await httpGet<unknown>(CARDS_URL, {
    signal,
    timeout: 60_000,
    headers: {
      Accept: "application/json",
      "User-Agent": BROWSER_UA,
      Origin: "https://lorcana.gg",
      Referer: "https://lorcana.gg/cards/",
    },
  });
  return response.data;
}

/**
 * Load (or reuse) the compact Cardmarket price index for Lorcana.
 * Never throws — empty index on failure so other price providers still run.
 */
export async function loadDotggPriceIndex(
  options: {
    signal?: AbortSignal;
    now?: Date;
    /**
     * Rejoue uniquement l'index déjà en ProviderEvidence — aucun HTTP.
     * Miss ⇒ index vide (les autres providers de prix peuvent encore répondre).
     */
    evidenceOnly?: boolean;
  } = {},
): Promise<DotggPriceIndex> {
  const nowMs = (options.now ?? new Date()).getTime();
  if (
    memoryIndex &&
    nowMs - memoryIndexLoadedAt < DOTGG_PRICE_TTL_MS
  ) {
    return memoryIndex;
  }

  const stored = await getFreshProviderEvidence(
    PROVIDER_ID,
    CARDS_URL,
    options.now,
  ).catch(() => null);
  if (stored?.yieldJson && typeof stored.yieldJson === "object") {
    memoryIndex = stored.yieldJson as DotggPriceIndex;
    memoryIndexLoadedAt = nowMs;
    return memoryIndex;
  }
  if (options.evidenceOnly) return {};

  return (inFlight ??= (async () => {
    try {
      const payload = await fetchDotggCardsPayload(options.signal);
      const index = priceIndexFromDotggCards(payload);
      await putProviderEvidence({
        providerId: PROVIDER_ID,
        url: CARDS_URL,
        kind: EVIDENCE_KIND,
        yieldJson: index,
        ttlMs: DOTGG_PRICE_TTL_MS,
      });
      memoryIndex = index;
      memoryIndexLoadedAt = Date.now();
      return index;
    } catch {
      return {};
    } finally {
      inFlight = null;
    }
  })());
}

/** Test helper — drop the in-flight join between cases. */
export function resetDotggPriceIndexCache(): void {
  inFlight = null;
  memoryIndex = null;
  memoryIndexLoadedAt = 0;
}

export async function fetchDotggCardForPrintKey(
  printKey: string | null | undefined,
  options: {
    signal?: AbortSignal;
    now?: Date;
    evidenceOnly?: boolean;
  } = {},
): Promise<DotggCardPrices | null> {
  const lookup = dotggLookupFromPrintKey(printKey);
  if (!lookup) return null;
  const index = await loadDotggPriceIndex(options);
  return lookupDotggCard(index, lookup);
}
