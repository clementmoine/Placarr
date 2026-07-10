import { prisma } from "@/lib/db/prisma";

import type { MetadataResult } from "@/types/metadataProvider";
import type { SSGame } from "./resolver";
import { parseScreenScraperMediaUrl, pickSSCover } from "./mediaUrl";

const MEMORY_GAME_TTL_MS = 24 * 60 * 60 * 1000;
const MEMORY_SEARCH_TTL_MS = 6 * 60 * 60 * 1000;
/** Empty search results are cached briefly so retry loops don't hammer the API. */
const MEMORY_SEARCH_MISS_TTL_MS = 15 * 60 * 1000;
const MEMORY_LOOKUP_TTL_MS = 45 * 60 * 1000;
const MEMORY_LOOKUP_MISS_TTL_MS = 15 * 60 * 1000;
const PERSISTENT_GAME_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PERSISTENT_LOOKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const QUOTA_COOLDOWN_MS = 20 * 60 * 1000;

type TimedEntry<T> = { expires: number; value: T };

const gameByIdMemory = new Map<number, TimedEntry<SSGame>>();
const searchMemory = new Map<string, TimedEntry<SSGame[]>>();
const lookupMemory = new Map<string, TimedEntry<MetadataResult>>();
const lookupMissMemory = new Map<string, TimedEntry<true>>();
const inFlightLookups = new Map<string, Promise<MetadataResult | null>>();

let quotaBlockedUntil = 0;

function normalizeLookupPart(value?: string | null): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Bump when the resolver's output shape changes so stale cached results are
// re-resolved instead of served. v4: reject lookups cached without gallery
// images (poisoned Alan Wake / empty-media entries).
const SCREENSCRAPER_LOOKUP_CACHE_VERSION = "v4";

export function buildScreenScraperLookupKey(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): string {
  const normalizedBarcode = normalizeLookupPart(barcode);
  const parts = [SCREENSCRAPER_LOOKUP_CACHE_VERSION, normalizedBarcode];
  // Same barcode resolves to the same game regardless of title variant — key
  // without the name so fallback / recheck / lookup-query passes share one cache.
  if (!normalizedBarcode) {
    parts.push(normalizeLookupPart(name));
  }
  parts.push(normalizeLookupPart(platform));
  return parts.join("|");
}

function gameSettingKey(gameId: number): string {
  return `screenscraper:game:${gameId}`;
}

function lookupSettingKey(lookupKey: string): string {
  return `screenscraper:lookup:${lookupKey}`;
}

function searchMemoryKey(query: string, systemeid?: number): string {
  return `${systemeid ?? 0}|${normalizeLookupPart(query)}`;
}

export function markScreenScraperQuotaHit(): void {
  quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
}

export function isScreenScraperQuotaBlocked(): boolean {
  return Date.now() < quotaBlockedUntil;
}

export function getScreenScraperInFlightLookup(
  lookupKey: string,
): Promise<MetadataResult | null> | undefined {
  return inFlightLookups.get(lookupKey);
}

export function setScreenScraperInFlightLookup(
  lookupKey: string,
  promise: Promise<MetadataResult | null>,
): void {
  inFlightLookups.set(lookupKey, promise);
}

export function clearScreenScraperInFlightLookup(lookupKey: string): void {
  inFlightLookups.delete(lookupKey);
}

export async function getCachedScreenScraperGame(
  gameId: number,
  options: { allowStale?: boolean } = {},
): Promise<SSGame | null> {
  const now = Date.now();
  const memory = gameByIdMemory.get(gameId);
  if (memory && (options.allowStale || memory.expires > now)) {
    return memory.value;
  }

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: gameSettingKey(gameId) },
    });
    if (!setting?.value) return null;

    const parsed = JSON.parse(setting.value) as {
      expires: number;
      game: SSGame;
    };
    if (!parsed?.game?.id) return null;
    if (!options.allowStale && parsed.expires <= now) return null;

    gameByIdMemory.set(gameId, {
      expires: Math.max(parsed.expires, now + MEMORY_GAME_TTL_MS),
      value: parsed.game,
    });
    return parsed.game;
  } catch {
    return null;
  }
}

export async function cacheScreenScraperGame(
  gameId: number,
  game: SSGame,
): Promise<void> {
  const expires = Date.now() + PERSISTENT_GAME_TTL_MS;
  gameByIdMemory.set(gameId, { expires, value: game });

  void prisma.setting
    .upsert({
      where: { key: gameSettingKey(gameId) },
      create: {
        key: gameSettingKey(gameId),
        value: JSON.stringify({ expires, game }),
      },
      update: {
        value: JSON.stringify({ expires, game }),
      },
    })
    .catch((error) => {
      console.warn(
        `[ScreenScraper] Failed to persist game cache ${gameId}`,
        error,
      );
    });
}

export function getCachedScreenScraperSearch(
  query: string,
  systemeid?: number,
): SSGame[] | null {
  const entry = searchMemory.get(searchMemoryKey(query, systemeid));
  if (!entry || entry.expires <= Date.now()) return null;
  return entry.value;
}

export function cacheScreenScraperSearch(
  query: string,
  systemeid: number | undefined,
  results: SSGame[],
): void {
  searchMemory.set(searchMemoryKey(query, systemeid), {
    expires:
      Date.now() +
      (results.length > 0 ? MEMORY_SEARCH_TTL_MS : MEMORY_SEARCH_MISS_TTL_MS),
    value: results,
  });
}

export function isScreenScraperLookupMissCached(lookupKey: string): boolean {
  const entry = lookupMissMemory.get(lookupKey);
  return Boolean(entry && entry.expires > Date.now());
}

export function markScreenScraperLookupMiss(lookupKey: string): void {
  lookupMissMemory.set(lookupKey, {
    expires: Date.now() + MEMORY_LOOKUP_MISS_TTL_MS,
    value: true,
  });
}

export function resetScreenScraperCachesForTests(): void {
  gameByIdMemory.clear();
  searchMemory.clear();
  lookupMemory.clear();
  lookupMissMemory.clear();
  inFlightLookups.clear();
  quotaBlockedUntil = 0;
}

export function getCachedScreenScraperLookup(
  lookupKey: string,
): MetadataResult | null {
  const entry = lookupMemory.get(lookupKey);
  if (!entry || entry.expires <= Date.now()) return null;
  return entry.value;
}

export async function getPersistedScreenScraperLookup(
  lookupKey: string,
  options: { allowStale?: boolean } = {},
): Promise<MetadataResult | null> {
  const memory = getCachedScreenScraperLookup(lookupKey);
  if (memory) return memory;

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: lookupSettingKey(lookupKey) },
    });
    if (!setting?.value) return null;

    const parsed = JSON.parse(setting.value) as {
      expires: number;
      result: MetadataResult;
    };
    if (!parsed?.result) return null;
    if (!options.allowStale && parsed.expires <= Date.now()) return null;

    lookupMemory.set(lookupKey, {
      expires: Math.max(parsed.expires, Date.now() + MEMORY_LOOKUP_TTL_MS),
      value: parsed.result,
    });
    return parsed.result;
  } catch {
    return null;
  }
}

export function cacheScreenScraperLookup(
  lookupKey: string,
  result: MetadataResult,
): void {
  const expires = Date.now() + PERSISTENT_LOOKUP_TTL_MS;
  lookupMemory.set(lookupKey, {
    expires: Date.now() + MEMORY_LOOKUP_TTL_MS,
    value: result,
  });

  void prisma.setting
    .upsert({
      where: { key: lookupSettingKey(lookupKey) },
      create: {
        key: lookupSettingKey(lookupKey),
        value: JSON.stringify({ expires, result }),
      },
      update: {
        value: JSON.stringify({ expires, result }),
      },
    })
    .catch((error) => {
      console.warn("[ScreenScraper] Failed to persist lookup cache", error);
    });
}

export async function persistScreenScraperGameIdForBarcode(
  barcode: string | null | undefined,
  gameId: number,
  coverUrl?: string | null,
): Promise<void> {
  const cleanedBarcode = (barcode || "").replace(/[^\d]/g, "").trim();
  if (!cleanedBarcode || !gameId) return;

  const cached = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    include: { rawNames: true },
  });
  if (!cached?.rawNames.length) return;

  let targetCoverUrl =
    coverUrl && parseScreenScraperMediaUrl(coverUrl)?.gameId === gameId
      ? coverUrl
      : null;

  // No usable cover was passed in: recover the real one from the cached game
  // rather than fabricating a region (e.g. box-2D(eu)) that ScreenScraper may
  // report as NOMEDIA — which would surface as a broken image. pickSSCover
  // returns an existing region's box URL, or null when the game has no cover.
  if (!targetCoverUrl) {
    const cachedGame = await getCachedScreenScraperGame(gameId);
    targetCoverUrl = cachedGame?.medias ? pickSSCover(cachedGame.medias) : null;
  }

  if (!targetCoverUrl) return;

  const rawNameNeedingCover = cached.rawNames.find((rawName) => {
    if (!rawName.coverUrl) return true;
    return !parseScreenScraperMediaUrl(rawName.coverUrl)?.gameId;
  });

  if (!rawNameNeedingCover) return;

  await prisma.rawName.update({
    where: { id: rawNameNeedingCover.id },
    data: { coverUrl: targetCoverUrl },
  });
}
