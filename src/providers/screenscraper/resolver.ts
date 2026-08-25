import { httpGet, isAxiosError } from "@/lib/http/httpClient";
import { prisma } from "@/lib/db/prisma";
import levenshtein from "fast-levenshtein";
import { retry } from "@/lib/http/retry";
import {
  makeObservationUsage,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import { metadataTitleSimilarity } from "@/core/enrich/titleMatching";
import { repairCatalogColonSubstitute } from "@/core/enrich/titles/normalize";
import {
  detectScreenScraperSystemId,
  getPlatformKeyByScreenScraperSystemId,
  getScreenScraperSystemId,
  VIDEO_GAME_PLATFORM_TOKEN_TERMS,
} from "@/core/identify/platforms/platforms";
import { withMetadataPlatformKeys } from "@/core/enrich/media/platformKeyStamp";
import { GENERIC_TITLE_TOKENS } from "@/core/enrich/titles/identityNoise";
import {
  GAME_EDITION_TERMS,
  LISTING_CONDITION_TERMS,
  LISTING_EDITION_PACKAGING_EXTRA_TERMS,
  LISTING_NOISE_TERMS,
} from "@/core/identify/listingTerms";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type {
  ImageObservationRole,
  MetadataObservation,
  ObservationEvidenceSignal,
} from "@/types/metadataObservation";
import {
  getScreenScraperDebugParams,
  getScreenScraperEnv,
  buildScreenScraperBaseParams,
  SCREEN_SCRAPER_REQUEST_TIMEOUT_MS,
  type ScreenScraperEnv,
} from "./env";
import {
  buildScreenScraperLookupKey,
  cacheScreenScraperGame,
  cacheScreenScraperLookup,
  cacheScreenScraperSearch,
  clearScreenScraperInFlightLookup,
  getCachedScreenScraperGame,
  getCachedScreenScraperSearch,
  getPersistedScreenScraperLookup,
  getScreenScraperInFlightLookup,
  isScreenScraperLookupMissCached,
  isScreenScraperQuotaBlocked,
  markScreenScraperLookupMiss,
  markScreenScraperQuotaHit,
  persistScreenScraperGameIdForBarcode,
  setScreenScraperInFlightLookup,
} from "./cache";
import {
  parseScreenScraperMediaUrl,
  screenScraperMediaAttachmentSemantics,
  isScreenScraperPlaceholderMedia,
  pickSSCover,
  type SSMedia,
} from "./mediaUrl";
import { areLikelySameProduct } from "@/core/identify/titleUtils";
import { stripLegalMarkSymbols } from "@/core/enrich/search/query";
import { isWeakMetadataSearchFragment } from "@/core/enrich/titles/searchVariants";
import { metadataHasDisplayImage } from "@/core/enrich/media/displayImage";
import { resolveAttachmentDisplayRegion } from "@/core/enrich/media/attachmentDisplayLabels";

export { parseScreenScraperMediaUrl } from "./mediaUrl";
export {
  pickSSCover,
  isScreenScraperPlaceholderMedia,
  type SSMedia,
} from "./mediaUrl";

function getPlatformKeyFromSSSystemId(systemId?: number): string | undefined {
  if (!systemId) return undefined;
  return getPlatformKeyByScreenScraperSystemId(systemId) || undefined;
}

function getPlatformKeyFromSSMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const systemMatch = url.match(/[?&]systemeid=(\d+)/);
  const systemId = systemMatch ? Number(systemMatch[1]) : undefined;
  return getPlatformKeyFromSSSystemId(systemId);
}

/**
 * Public ScreenScraper fiche URL (not the authenticated API endpoint).
 * `plateforme` is the ScreenScraper system id (e.g. 62 = PS Vita).
 */
export function buildScreenScraperGamePageUrl(
  gameId: string | number,
  systemId?: string | number | null,
): string {
  const params = new URLSearchParams();
  const plateforme =
    systemId != null && String(systemId).trim() !== ""
      ? String(systemId).trim()
      : "";
  if (/^\d+$/.test(plateforme)) {
    params.set("plateforme", plateforme);
  }
  params.set("gameid", String(gameId).trim());
  return `https://www.screenscraper.fr/gameinfos.php?${params.toString()}`;
}

/** Rewrite api.screenscraper.fr/jeuInfos.php links to the public gameinfos page. */
export function rewriteScreenScraperGameInfoUrl(
  url: string | null | undefined,
  systemId?: string | number | null,
): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (!parsed.hostname.includes("screenscraper.fr")) return null;
    const gameId =
      parsed.searchParams.get("gameid") || parsed.searchParams.get("gameId");
    if (!gameId) return null;

    const fromQuery =
      parsed.searchParams.get("plateforme") ||
      parsed.searchParams.get("systemeid");
    const resolvedSystemId = fromQuery || systemId;

    if (parsed.pathname.includes("gameinfos.php")) {
      const next = buildScreenScraperGamePageUrl(gameId, resolvedSystemId);
      return next === parsed.toString() ? null : next;
    }

    if (
      parsed.hostname.startsWith("api.") ||
      parsed.pathname.includes("jeuInfos.php")
    ) {
      return buildScreenScraperGamePageUrl(gameId, resolvedSystemId);
    }
  } catch {
    return null;
  }
  return null;
}

/** Hard cap on jeuRecherche calls per metadata lookup (fallback loops add up fast). */
const MAX_SCREENSCRAPER_SEARCH_ATTEMPTS = 10;
const MAX_CACHED_BARCODE_SUGGESTION_CANDIDATES = 3;

export interface SSGame {
  id?: number;
  systeme?: { id?: number | string; text?: string };
  noms?: { region: string; text: string }[];
  synopsis?: { langue: string; text: string }[];
  dates?: { region: string; text: string }[];
  editeur?: { text: string };
  developpeur?: { text: string };
  joueurs?: string | { text?: string } | Array<string | { text?: string }>;
  modes?: string | { text?: string } | Array<string | { text?: string }>;
  note?: { text: string };
  classifications?: { type?: string; text?: string }[];
  medias?: SSMedia[];
}

function pickSSTitle(noms?: SSGame["noms"]): string | undefined {
  if (!noms || noms.length === 0) return undefined;
  const regionOrder = ["fr", "eu", "wor", "uk", "us", "jp"];
  const regionRank = (region?: string) => {
    const index = regionOrder.indexOf((region || "").toLowerCase());
    return index === -1 ? regionOrder.length : index;
  };

  const text = noms
    .slice()
    .sort((a, b) => regionRank(a.region) - regionRank(b.region))[0]?.text;
  return text ? repairCatalogColonSubstitute(text) : undefined;
}

/** Pick the regional title that best matches what we searched for. */
function pickSSTitleForTarget(
  noms: SSGame["noms"] | undefined,
  targetName: string,
): string | undefined {
  if (!noms?.length) return undefined;

  const regionOrder = ["fr", "eu", "wor", "uk", "us", "jp"];
  const regionRank = (region?: string) => {
    const index = regionOrder.indexOf((region || "").toLowerCase());
    return index === -1 ? regionOrder.length : index;
  };

  let best = noms[0];
  let bestScore = -1;
  for (const nom of noms) {
    const score = metadataTitleSimilarity(targetName, nom.text);
    if (
      score > bestScore ||
      (score === bestScore && regionRank(nom.region) < regionRank(best.region))
    ) {
      bestScore = score;
      best = nom;
    }
  }

  return best.text ? repairCatalogColonSubstitute(best.text) : undefined;
}

const SCREENSCRAPER_TITLE_MATCH_MIN_SCORE = 0.55;

export function scoreScreenScraperGameTitleMatch(
  targetName: string,
  noms?: SSGame["noms"],
): number {
  if (!noms?.length) return 0;
  let best = 0;
  for (const nom of noms) {
    best = Math.max(best, metadataTitleSimilarity(targetName, nom.text));
  }
  return best;
}

function pickSSSynopsis(synopsis?: SSGame["synopsis"]): string | undefined {
  if (!synopsis || synopsis.length === 0) return undefined;
  const langOrder = ["fr", "en"];
  for (const lang of langOrder) {
    const found = synopsis.find((s) => s.langue === lang);
    if (found) return repairCatalogColonSubstitute(found.text);
  }
  return repairCatalogColonSubstitute(synopsis[0].text);
}

function detectSystemIdFromName(name: string): number | undefined {
  return detectScreenScraperSystemId(name) || undefined;
}

function detectCachedCandidateSystemId(name: string): number | undefined {
  const systemId = detectSystemIdFromName(name);
  if (systemId) return systemId;

  const normalized = name.toLowerCase().replace(/[._-]+/g, " ");
  if (/\b64\b/.test(normalized)) return 14;

  return undefined;
}

function hasCachedCandidateSystemConflict(
  name: string,
  requestedSystemId?: number,
): boolean {
  if (!requestedSystemId) return false;
  const candidateSystemId = detectCachedCandidateSystemId(name);
  return !!candidateSystemId && candidateSystemId !== requestedSystemId;
}

function isScreenScraperQuotaError(error: unknown): boolean {
  return (
    isAxiosError(error) &&
    (error.response?.status === 430 || error.response?.status === 429)
  );
}

async function fetchScreenScraperGameById(
  baseParams: Record<string, string>,
  gameId: number,
  credentials: ScreenScraperEnv,
  options?: { isBackground?: boolean; signal?: AbortSignal },
): Promise<SSGame | null> {
  const cached = await getCachedScreenScraperGame(gameId);
  if (cached) {
    console.info(`[ScreenScraper] Cache hit for game ${gameId}`);
    return cached;
  }

  try {
    const queryFn = () =>
      httpGet<{ response: { jeu: SSGame } }>(
        "https://api.screenscraper.fr/api2/jeuInfos.php",
        {
          params: {
            ...baseParams,
            crc: "",
            md5: "",
            sha1: "",
            systemeid: "0",
            romtype: "rom",
            romnom: "",
            romtaille: "",
            gameid: String(gameId),
            ...getScreenScraperDebugParams(credentials),
          },
          timeout: SCREEN_SCRAPER_REQUEST_TIMEOUT_MS,
          signal: options?.signal,
        },
      );

    const attempts = options?.isBackground ? 2 : 1;
    const infoRes = await retry(
      queryFn,
      attempts,
      options?.isBackground ? 1500 : 1000,
      options?.signal,
    );

    const jeu = infoRes.data?.response?.jeu;
    if (!jeu?.id) return null;
    await cacheScreenScraperGame(gameId, jeu);
    return jeu;
  } catch (error) {
    if (isScreenScraperQuotaError(error)) {
      markScreenScraperQuotaHit();
      const stale = await getCachedScreenScraperGame(gameId, {
        allowStale: true,
      });
      if (stale) {
        console.warn(
          `[ScreenScraper] Quota hit — serving stale cache for game ${gameId}`,
        );
        return stale;
      }
    }
    throw error;
  }
}

async function resolveScreenScraperGameIdFromBarcodeCache(
  barcode: string,
  requestedSystemId?: number,
  requestedName?: string | null,
): Promise<{ gameId: number; systemId?: number } | null> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanedBarcode) return null;

  const cached = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    include: { rawNames: true },
  });
  if (!cached?.rawNames.length) return null;

  const trimmedName = requestedName?.trim();
  for (const rawName of cached.rawNames) {
    if (!rawName.coverUrl) continue;
    const parsed = parseScreenScraperMediaUrl(rawName.coverUrl);
    if (!parsed?.gameId) continue;
    if (
      requestedSystemId &&
      parsed.systemId &&
      parsed.systemId !== requestedSystemId
    ) {
      continue;
    }
    // Guide the canonical by the chosen item: only reuse a cached ScreenScraper
    // game whose cached name matches the one we are resolving. For an ambiguous
    // barcode (where a marketplace consensus led with a different product than
    // the one ScreenScraper pinned by barcode), this skips the mismatched cover
    // and lets the name search below find the correct game.
    if (trimmedName && !areLikelySameProduct(trimmedName, rawName.value)) {
      continue;
    }
    return { gameId: parsed.gameId, systemId: parsed.systemId };
  }

  return null;
}

function normalizeScreenScraperSearchQuery(value: string): string {
  return stripLegalMarkSymbols(
    value.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim(),
  );
}

/** Collapse subtitle separators so "Alice : Foo" and "Alice - Foo" dedupe. */
export function collapseScreenScraperTitlePunctuation(value: string): string {
  return normalizeScreenScraperSearchQuery(value)
    .replace(/\s*[:\-–—]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function screenScraperSearchQueryKey(value: string): string {
  return collapseScreenScraperTitlePunctuation(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function uniqueScreenScraperSearchQueries(values: string[]): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];

  for (const value of values) {
    const normalized = normalizeScreenScraperSearchQuery(value);
    if (normalized.length < 2) continue;

    const key = screenScraperSearchQueryKey(normalized);
    if (seen.has(key)) continue;

    seen.add(key);
    queries.push(normalized);
  }

  return queries;
}

/**
 * Ultra-broad first-word queries that must not hit ScreenScraper alone.
 * Shared generics + a closed provider-local set of title words that are
 * too common as standalone search seeds (`club`, `star`, `super`).
 * `jeux` comes from `GENERIC_TITLE_TOKENS` (IDENTITY_MEDIA_CATEGORY_TOKENS).
 */
const BROAD_SCREENSCRAPER_FALLBACK_WORDS = new Set([
  ...GENERIC_TITLE_TOKENS,
  ...VIDEO_GAME_PLATFORM_TOKEN_TERMS,
  "club",
  "star",
  "super",
]);

/**
 * Non-distinctive listing/edition chrome for significant-token overlap.
 * Derived from shared taxonomies + a thin SS-local connector set.
 * `complet` / `complete` come from `LISTING_CONDITION_TERMS`.
 */
const NON_DISTINCTIVE_SCREENSCRAPER_TOKENS = new Set([
  ...GENERIC_TITLE_TOKENS,
  ...LISTING_NOISE_TERMS,
  ...LISTING_EDITION_PACKAGING_EXTRA_TERMS,
  ...GAME_EDITION_TERMS.filter((term) => !/\s/.test(term)),
  ...LISTING_CONDITION_TERMS.filter(
    (term) =>
      !/\s/.test(term) &&
      (term.toLowerCase() === "complet" || term.toLowerCase() === "complete"),
  ),
  "sans",
  "bundle",
  "pack",
  "packs",
  "force",
]);

/** @internal — unit tests for taxonomy-backed SS chrome tokens. */
export function __screenScraperChromeTokensForTests() {
  return {
    broad: BROAD_SCREENSCRAPER_FALLBACK_WORDS,
    nonDistinctive: NON_DISTINCTIVE_SCREENSCRAPER_TOKENS,
  };
}

function screenScraperSignificantTokens(
  value: string,
  cleanSearchQuery: (name: string) => string,
): Set<string> {
  const tokens = cleanSearchQuery(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length > 2 &&
        !BROAD_SCREENSCRAPER_FALLBACK_WORDS.has(token) &&
        !NON_DISTINCTIVE_SCREENSCRAPER_TOKENS.has(token),
    );

  return new Set(tokens);
}

export function isPlausibleScreenScraperFallbackResult(
  originalName: string,
  resultName: string,
  cleanSearchQuery: (name: string) => string,
): boolean {
  if (
    metadataTitleSimilarity(originalName, resultName) >=
    SCREENSCRAPER_TITLE_MATCH_MIN_SCORE
  ) {
    return true;
  }

  const originalTokens = screenScraperSignificantTokens(
    originalName,
    cleanSearchQuery,
  );
  const resultTokens = screenScraperSignificantTokens(
    resultName,
    cleanSearchQuery,
  );
  if (originalTokens.size <= 1) return true;

  const overlap = [...originalTokens].filter((token) =>
    resultTokens.has(token),
  );
  return overlap.length >= Math.min(2, originalTokens.size);
}

export function shouldUseCachedScreenScraperSuggestions(
  cleanedName: string,
  cleanSearchQuery: (name: string) => string,
): boolean {
  const tokenCount = screenScraperSignificantTokens(
    cleanedName,
    cleanSearchQuery,
  ).size;
  return tokenCount <= 4;
}

/** Pinned ScreenScraper games should expose a box cover, not only screenshots. */
export function screenScraperLookupHasCanonicalCover(
  cached: MetadataResult,
): boolean {
  const gameId = cached.externalIds?.screenscraper?.trim();
  if (!gameId) return true;

  const hasCoverAttachment = cached.attachments?.some(
    (attachment) =>
      attachment.source === "screenscraper" &&
      attachment.type === "cover" &&
      Boolean(attachment.url?.trim()),
  );
  if (hasCoverAttachment) return true;

  const imageUrl = cached.imageUrl?.trim();
  if (imageUrl) {
    const parsed = parseScreenScraperMediaUrl(imageUrl);
    if (parsed?.mediaType === "box-2D" || parsed?.mediaType === "box-3D") {
      return true;
    }
  }

  return false;
}

export function screenScraperLookupNeedsCoverHydration(
  cached: MetadataResult,
): boolean {
  if (!cached.externalIds?.screenscraper?.trim()) return false;
  return !screenScraperLookupHasCanonicalCover(cached);
}

export function mergeScreenScraperLookupWithGame(
  cached: MetadataResult,
  gameData: SSGame,
  requestedName?: string,
): MetadataResult {
  const resolvedName = requestedName?.trim() || cached.title || "";
  const title =
    pickSSTitleForTarget(gameData.noms, resolvedName) ||
    pickSSTitle(gameData.noms) ||
    cached.title;
  const coverFromGame = gameData.medias ? pickSSCover(gameData.medias) : null;

  const resolvedPlatformKey =
    getPlatformKeyFromSSSystemId(Number(gameData.systeme?.id)) ||
    getPlatformKeyFromSSMediaUrl(coverFromGame) ||
    getPlatformKeyFromSSMediaUrl(cached.imageUrl);

  const attachmentByUrl = new Map<string, MetadataAttachment>();
  for (const attachment of cached.attachments ?? []) {
    const url = attachment.url?.trim();
    if (url) attachmentByUrl.set(url, attachment);
  }
  if (gameData.medias) {
    for (const media of gameData.medias) {
      if (isScreenScraperPlaceholderMedia(media)) continue;
      const semantics = screenScraperMediaAttachmentSemantics(media);
      if (!semantics) continue;
      const url = media.url?.trim();
      if (!url || attachmentByUrl.has(url)) continue;
      attachmentByUrl.set(url, {
        type: semantics.type,
        role: semantics.role,
        url: media.url,
        source: "screenscraper",
        platformKey:
          resolvedPlatformKey || getPlatformKeyFromSSMediaUrl(media.url),
      });
    }
  }

  const imageUrl =
    screenScraperLookupHasCanonicalCover(cached) && cached.imageUrl?.trim()
      ? cached.imageUrl
      : coverFromGame || cached.imageUrl || undefined;

  return withMetadataPlatformKeys(
    {
      ...cached,
      title: title || cached.title,
      description: cached.description ?? pickSSSynopsis(gameData.synopsis),
      imageUrl,
      attachments: [...attachmentByUrl.values()],
      releaseDate: cached.releaseDate ?? gameData.dates?.[0]?.text ?? undefined,
      publishers:
        cached.publishers ??
        (gameData.editeur?.text || gameData.developpeur?.text
          ? [{ name: (gameData.editeur?.text ?? gameData.developpeur?.text)! }]
          : undefined),
      externalIds: cached.externalIds ?? {
        screenscraper: String(gameData.id),
      },
      platformKey: cached.platformKey ?? resolvedPlatformKey,
    },
    resolvedPlatformKey,
  );
}

export async function hydrateScreenScraperLookupFromGameCache(
  cached: MetadataResult,
  requestedName?: string,
): Promise<MetadataResult> {
  const gameId = Number(cached.externalIds?.screenscraper);
  if (!Number.isFinite(gameId) || gameId <= 0) return cached;

  const game = await getCachedScreenScraperGame(gameId);
  if (!game) return cached;

  return mergeScreenScraperLookupWithGame(cached, game, requestedName);
}

function screenScraperLookupAttachmentSignature(
  result: MetadataResult,
): string {
  return (result.attachments ?? [])
    .map((attachment) => attachment.url?.trim() ?? "")
    .filter(Boolean)
    .sort()
    .join("|");
}

export function buildScreenScraperSearchQueries(
  name: string,
  cleanSearchQuery: (name: string) => string,
): string[] {
  const searchName = stripLegalMarkSymbols(name.trim()) || name.trim();
  const cleanedName = cleanSearchQuery(searchName);
  const bases = uniqueScreenScraperSearchQueries([searchName, cleanedName]);
  const variants: string[] = [searchName];

  for (const base of bases) {
    const licensedEdition = base.match(/^(club football\s+\d{4})\s+(.+)$/i);
    if (licensedEdition) {
      variants.push(
        `${licensedEdition[1]} - ${licensedEdition[2]}`,
        `${licensedEdition[1]} : ${licensedEdition[2]}`,
      );
    }

    const subtitleSplit = base.match(/^([^:–—-]+?)\s*[:\-–—]\s*(.+)$/);
    if (subtitleSplit) {
      const leading = subtitleSplit[1].trim();
      const trailing = subtitleSplit[2].trim();
      if (!isWeakMetadataSearchFragment(leading)) variants.push(leading);
      if (!isWeakMetadataSearchFragment(trailing)) variants.push(trailing);
    }

    const withoutVideoGameSuffix = base
      .replace(/\s*,?\s*le\s+jeu\s+vid[eé]o\s*$/i, "")
      .replace(/\s+\b(le|la|les)\s*$/i, "")
      .trim();
    if (
      withoutVideoGameSuffix.length >= 3 &&
      withoutVideoGameSuffix.toLowerCase() !== base.toLowerCase()
    ) {
      variants.push(withoutVideoGameSuffix);
    }

    variants.push(
      base,
      collapseScreenScraperTitlePunctuation(base),
      base.replace(/\s*[!?]+$/g, ""),
      base.replace(/[!?]+/g, " "),
      base.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    );
  }

  return uniqueScreenScraperSearchQueries(variants).slice(0, 6);
}

async function searchScreenScraperGames(
  baseParams: Record<string, string>,
  query: string,
  systemeid?: number,
  options?: { isBackground?: boolean; signal?: AbortSignal },
): Promise<SSGame[]> {
  if (isScreenScraperQuotaBlocked()) {
    const cached = getCachedScreenScraperSearch(query, systemeid);
    if (cached) return cached;
    return [];
  }

  const cached = getCachedScreenScraperSearch(query, systemeid);
  if (cached) {
    console.info(`[ScreenScraper] Search cache hit for "${query}"`);
    return cached;
  }

  try {
    const queryFn = () =>
      httpGet<{
        response: { jeux?: SSGame[] | SSGame };
      }>("https://api.screenscraper.fr/api2/jeuRecherche.php", {
        params: {
          ...baseParams,
          recherche: query,
          ...(systemeid ? { systemeid: String(systemeid) } : {}),
        },
        timeout: SCREEN_SCRAPER_REQUEST_TIMEOUT_MS,
        signal: options?.signal,
      });

    const attempts = options?.isBackground ? 2 : 1;
    const searchRes = await retry(
      queryFn,
      attempts,
      options?.isBackground ? 1500 : 1000,
      options?.signal,
    );

    let results = searchRes.data?.response?.jeux;
    if (results && !Array.isArray(results)) {
      results = [results];
    }

    const filtered = (results || []).filter((r) => r && r.id);
    cacheScreenScraperSearch(query, systemeid, filtered);
    return filtered;
  } catch (error) {
    if (isScreenScraperQuotaError(error)) {
      markScreenScraperQuotaHit();
      console.warn(
        `[ScreenScraper] Quota exceeded during search for "${query}" — pausing API calls`,
      );
      const stale = getCachedScreenScraperSearch(query, systemeid);
      if (stale) return stale;
      return [];
    }
    throw error;
  }
}

type ScreenScraperResolverDeps = {
  cleanSearchQuery: (name: string) => string;
  formatScore: (value: number, scale: number) => string | null;
};

function screenScraperTextValues(
  value:
    string | { text?: string } | Array<string | { text?: string }> | undefined,
): string[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values
    .map((entry) => (typeof entry === "string" ? entry : entry.text))
    .map((entry) => entry?.replace(/\s+/g, " ").trim())
    .filter((entry): entry is string => Boolean(entry));
}

function normalizePlayerCountText(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/\b(players?|joueurs?)\b/gi, "")
    .replace(/\s*(?:to|à)\s*/gi, "-")
    .replace(/\s*[-–—]\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const range = cleaned.match(/^(\d+)\s*-\s*(\d+)\+?$/);
  if (range) return `${range[1]}-${range[2]}`;

  const single = cleaned.match(/^(\d+)\+?$/);
  if (single) return single[1];

  return raw.replace(/\s+/g, " ");
}

export function buildScreenScraperFacts(
  gameData: SSGame,
  formatScore: (value: number, scale: number) => string | null,
): MetadataFact[] {
  const facts: MetadataFact[] = [];

  const classification = gameData.classifications?.find((item) => item.text);
  const ageMatch = classification?.text?.match(/\d+/);
  if (ageMatch) {
    facts.push({
      kind: "age-rating",
      label: "PEGI",
      value: ageMatch[0],
      source: "screenscraper",
      confidence: 0.94,
      priority: 125,
    });
  }

  const note = Number(gameData.note?.text?.replace(",", "."));
  const rating = formatScore(note, 20);
  if (rating) {
    facts.push({
      kind: "rating",
      label: "ScreenScraper",
      value: rating,
      source: "screenscraper",
      confidence: 0.74,
      priority: 76,
    });
  }

  const players = screenScraperTextValues(gameData.joueurs)
    .map(normalizePlayerCountText)
    .find((value): value is string => Boolean(value));
  if (players) {
    facts.push({
      kind: "players",
      label: "Joueurs",
      value: players,
      source: "screenscraper",
      confidence: 0.82,
      priority: 70,
    });
  }

  const modes = Array.from(new Set(screenScraperTextValues(gameData.modes)));
  if (modes.length > 0) {
    facts.push({
      kind: "modes",
      label: "Modes de jeu",
      value: modes.slice(0, 5).join(" • "),
      source: "screenscraper",
      confidence: 0.72,
      priority: 52,
    });
  }

  return facts;
}

const SCREEN_SCRAPER_PROVIDER_ID = "screenscraper";

interface ScreenScraperObservationContext {
  sourceUrl?: string;
  hasBarcodeMatch: boolean;
  hasPlatformMatch: boolean;
}

function screenScraperImageRole(
  attachment: MetadataAttachment,
): ImageObservationRole {
  const role = (attachment.role || "").toLowerCase();
  if (attachment.type === "cover") {
    if (role.startsWith("3d-")) return "product_packshot";
    return "cover_front";
  }
  if (attachment.type === "screenshot") return "screenshot";
  if (attachment.type === "logo") return "logo";
  if (attachment.type === "background") return "background";
  if (attachment.type === "image") {
    if (role === "back" || role.startsWith("back-")) return "cover_back";
    if (role === "disc" || role.startsWith("disc-")) return "product_packshot";
    return "gallery_image";
  }
  return "gallery_image";
}

function screenScraperImageRegion(
  attachment: MetadataAttachment,
): string | undefined {
  // Reuse the shared, provider-agnostic region resolver so the full ScreenScraper
  // region vocabulary (ISO codes like `au`/`sp`, continent groupings, and compound
  // roles such as `back-au`/`3d-sp`) is recognised and bucketed into a canonical
  // region instead of being silently dropped.
  return (
    resolveAttachmentDisplayRegion({
      type: attachment.type,
      role: attachment.role,
    }) ?? undefined
  );
}

function imageObservationUsage(role: ImageObservationRole) {
  return makeObservationUsage({
    displayCandidate: true,
    evidence:
      role === "cover_front" ||
      role === "cover_back" ||
      role === "product_packshot"
        ? "strong"
        : "normal",
  });
}

export function buildScreenScraperObservations(
  metadata: MetadataResult,
  context: ScreenScraperObservationContext,
): MetadataObservation[] {
  const evidenceSignals: ObservationEvidenceSignal[] = ["structured_data"];
  if (context.hasBarcodeMatch) evidenceSignals.push("barcode_match");
  if (context.hasPlatformMatch) evidenceSignals.push("platform_match");

  const observations = observationsFromMetadataResult(
    {
      ...metadata,
      imageUrl: undefined,
      attachments: undefined,
    },
    {
      providerId: SCREEN_SCRAPER_PROVIDER_ID,
      providerLabel: "ScreenScraper",
      sourceDocumentRole: "api_object",
      sourceUrl: context.sourceUrl,
      evidenceSignals,
      titleRole: "object_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      externalIdRole: "provider_record_id",
      language: "unknown",
    },
  );

  const seenImageUrls = new Set<string>();
  const imageCandidates: MetadataAttachment[] = [
    ...(metadata.imageUrl
      ? [
          {
            type: "cover",
            url: metadata.imageUrl,
            source: SCREEN_SCRAPER_PROVIDER_ID,
          } satisfies MetadataAttachment,
        ]
      : []),
    ...(metadata.attachments || []),
  ];

  for (const attachment of imageCandidates) {
    const url = attachment.url?.trim();
    if (!url || seenImageUrls.has(url)) continue;
    seenImageUrls.add(url);

    const role = screenScraperImageRole(attachment);
    observations.push({
      kind: "image",
      role,
      type: attachment.type,
      url,
      title: attachment.title ?? null,
      region: screenScraperImageRegion(attachment) ?? null,
      provenance: {
        providerId: SCREEN_SCRAPER_PROVIDER_ID,
        providerLabel: "ScreenScraper",
        sourceDocumentRole:
          attachment.type === "cover" ? "api_object" : "gallery",
        sourceUrl: context.sourceUrl,
        evidenceSignals,
      },
      usage: imageObservationUsage(role),
    });
  }

  return observations;
}

function withScreenScraperObservations(
  metadata: MetadataResult,
  context: Partial<ScreenScraperObservationContext> = {},
): MetadataResult {
  const systemId =
    getScreenScraperSystemId(metadata.platformKey) ??
    detectScreenScraperSystemId(metadata.platformKey) ??
    null;
  const gameId = metadata.externalIds?.screenscraper;
  const sourceUrl =
    rewriteScreenScraperGameInfoUrl(context.sourceUrl, systemId) ||
    context.sourceUrl ||
    (gameId ? buildScreenScraperGamePageUrl(gameId, systemId) : undefined);

  if (
    metadata.observationSchemaVersion === METADATA_OBSERVATION_SCHEMA_VERSION &&
    (metadata.observations?.length || 0) > 0
  ) {
    if (!sourceUrl) return metadata;
    return {
      ...metadata,
      observations: metadata.observations!.map((observation) => {
        const current = observation.provenance?.sourceUrl;
        const rewritten =
          rewriteScreenScraperGameInfoUrl(current, systemId) || sourceUrl;
        if (!rewritten || rewritten === current) return observation;
        return {
          ...observation,
          provenance: {
            ...observation.provenance,
            sourceUrl: rewritten,
          },
        };
      }),
    };
  }

  return {
    ...metadata,
    observations: buildScreenScraperObservations(metadata, {
      sourceUrl,
      hasBarcodeMatch: context.hasBarcodeMatch ?? false,
      hasPlatformMatch: context.hasPlatformMatch ?? false,
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export function createScreenScraperResolver(deps: ScreenScraperResolverDeps) {
  async function resolveScreenScraperMetadata(
    name: string,
    barcode?: string | null,
    platform?: string | null,
    options?: {
      isBackground?: boolean;
      signal?: AbortSignal;
      lookupQueries?: string[];
    },
  ): Promise<MetadataResult | null> {
    const credentials = getScreenScraperEnv();

    if (!credentials) {
      console.info("[ScreenScraper] Not configured");
      return null;
    }

    const baseParams = buildScreenScraperBaseParams(credentials);

    try {
      let gameData: SSGame | null = null;
      let systemeid = platform ? detectSystemIdFromName(platform) : undefined;
      let resolvedSystemId: number | undefined;
      let resolvedFromBarcodeEvidence = false;
      if (!systemeid && name) {
        systemeid = detectSystemIdFromName(name);
      }

      if (barcode) {
        const cachedGame = await resolveScreenScraperGameIdFromBarcodeCache(
          barcode,
          systemeid,
          name,
        );
        if (cachedGame) {
          try {
            const jeu = await fetchScreenScraperGameById(
              baseParams,
              cachedGame.gameId,
              credentials,
              options,
            );
            if (jeu) {
              gameData = jeu;
              resolvedSystemId =
                cachedGame.systemId ?? (Number(jeu.systeme?.id) || systemeid);
              resolvedFromBarcodeEvidence = true;
              console.info(
                `[ScreenScraper] Resolved game ${cachedGame.gameId} from barcode cache for "${barcode}"`,
              );
            }
          } catch (error) {
            if (isScreenScraperQuotaError(error)) {
              console.warn(
                `[ScreenScraper] Quota exceeded while loading cached game ${cachedGame.gameId}`,
              );
            } else {
              console.error(
                `[ScreenScraper] Error loading cached game ${cachedGame.gameId}:`,
                error,
              );
            }
          }
        }
      }

      if (!gameData) {
        if (!name) return null;
        const cleanedName = deps.cleanSearchQuery(name);
        let searchNameUsed = cleanedName;
        const allowCachedSuggestionFallback =
          shouldUseCachedScreenScraperSuggestions(
            cleanedName,
            deps.cleanSearchQuery,
          );

        let validResults: SSGame[] = [];
        const searchQueries = uniqueScreenScraperSearchQueries([
          ...(options?.lookupQueries ?? []),
          ...buildScreenScraperSearchQueries(name, deps.cleanSearchQuery),
        ]).slice(0, MAX_SCREENSCRAPER_SEARCH_ATTEMPTS);
        let searchAttempts = 0;
        for (const query of searchQueries) {
          if (isScreenScraperQuotaBlocked()) break;
          if (searchAttempts >= MAX_SCREENSCRAPER_SEARCH_ATTEMPTS) break;
          try {
            searchAttempts += 1;
            validResults = await searchScreenScraperGames(
              baseParams,
              query,
              systemeid,
              options,
            );
            if (validResults.length > 0) {
              searchNameUsed = query;
              break;
            }
          } catch (err) {
            console.error(
              `[ScreenScraper] Search error for "${query}":`,
              err instanceof Error ? err.message : err,
            );
          }
        }

        if (
          (!validResults || validResults.length === 0) &&
          allowCachedSuggestionFallback
        ) {
          if (barcode) {
            const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
            if (cleanedBarcode) {
              try {
                const cached = await prisma.barcodeCache.findUnique({
                  where: { barcode: cleanedBarcode },
                  include: { rawNames: true },
                });
                if (cached && cached.rawNames.length > 0) {
                  const candidates = cached.rawNames
                    .map((rn) => deps.cleanSearchQuery(rn.value))
                    .filter((value) =>
                      isPlausibleScreenScraperFallbackResult(
                        cleanedName,
                        value,
                        deps.cleanSearchQuery,
                      ),
                    )
                    .filter(
                      (value) =>
                        value &&
                        !hasCachedCandidateSystemConflict(value, systemeid),
                    )
                    .filter((v, i, self) => v && self.indexOf(v) === i);

                  for (const cand of candidates.slice(
                    0,
                    MAX_CACHED_BARCODE_SUGGESTION_CANDIDATES,
                  )) {
                    if (cand.toLowerCase() === cleanedName.toLowerCase())
                      continue;
                    console.log(
                      `[ScreenScraper] Trying cached barcode suggestion search: "${cand}"`,
                    );
                    for (const query of buildScreenScraperSearchQueries(
                      cand,
                      deps.cleanSearchQuery,
                    )) {
                      if (isScreenScraperQuotaBlocked()) break;
                      if (searchAttempts >= MAX_SCREENSCRAPER_SEARCH_ATTEMPTS) {
                        break;
                      }
                      try {
                        searchAttempts += 1;
                        const newValid = await searchScreenScraperGames(
                          baseParams,
                          query,
                          systemeid,
                          options,
                        );
                        if (newValid.length > 0) {
                          validResults = newValid;
                          searchNameUsed = query;
                          console.log(
                            `[ScreenScraper] Found match via cached suggestion "${query}"`,
                          );
                          break;
                        }
                      } catch (err) {
                        console.error(
                          `[ScreenScraper] Cached suggestion search error for "${query}":`,
                          err instanceof Error ? err.message : err,
                        );
                      }
                    }
                    if (validResults.length > 0) break;
                  }
                }
              } catch (err) {
                console.error(
                  "[ScreenScraper] Error fetching barcode cache suggestions:",
                  err,
                );
              }
            }
          }
        } else if (!allowCachedSuggestionFallback) {
          console.info(
            `[ScreenScraper] Skipping cached suggestion fallback for specific query "${cleanedName}"`,
          );
        }

        if (!validResults || validResults.length === 0) {
          const queryTokens = cleanedName.split(/\s+/).filter(Boolean);
          const firstWord = queryTokens[0];
          if (
            firstWord &&
            firstWord.length >= 3 &&
            queryTokens.length <= 1 &&
            !BROAD_SCREENSCRAPER_FALLBACK_WORDS.has(firstWord.toLowerCase())
          ) {
            console.log(
              `[ScreenScraper] Search for "${cleanedName}" returned no results. Trying first word fallback search: "${firstWord}"`,
            );
            try {
              const fallbackResults = await searchScreenScraperGames(
                baseParams,
                firstWord,
                systemeid,
                options,
              );
              validResults = fallbackResults.filter(
                (result) =>
                  scoreScreenScraperGameTitleMatch(cleanedName, result.noms) >=
                  SCREENSCRAPER_TITLE_MATCH_MIN_SCORE,
              );
              if (validResults.length > 0) {
                searchNameUsed = firstWord;
              }
            } catch (err) {
              console.error(
                `[ScreenScraper] Fallback search error:`,
                err instanceof Error ? err.message : err,
              );
            }
          } else if (firstWord) {
            console.info(
              `[ScreenScraper] Skipping broad first word fallback search: "${firstWord}"`,
            );
          }
        }

        if (!validResults || validResults.length === 0) {
          console.info(`[ScreenScraper] No results for "${name}"`);
          return null;
        }

        const targetNameForRanking =
          name.trim() || cleanedName || searchNameUsed;
        const titleMatchedResults = validResults.filter(
          (result) =>
            scoreScreenScraperGameTitleMatch(
              targetNameForRanking,
              result.noms,
            ) >= SCREENSCRAPER_TITLE_MATCH_MIN_SCORE,
        );
        if (titleMatchedResults.length > 0) {
          validResults = titleMatchedResults;
        }

        const platformCompatibleResults = systemeid
          ? validResults.filter((r) => {
              if (r.systeme?.id) {
                return Number(r.systeme.id) === systemeid;
              }
              const title = pickSSTitle(r.noms) || "";
              return !hasCachedCandidateSystemConflict(title, systemeid);
            })
          : validResults;
        const rankedResults =
          platformCompatibleResults.length > 0
            ? platformCompatibleResults
            : validResults;

        let bestId = rankedResults[0].id;
        let minDist = Infinity;
        let bestMatchScore = -1;
        for (const r of rankedResults) {
          const rTitle =
            pickSSTitleForTarget(r.noms, targetNameForRanking) ||
            pickSSTitle(r.noms) ||
            "";
          const matchScore = scoreScreenScraperGameTitleMatch(
            targetNameForRanking,
            r.noms,
          );
          const dist = levenshtein.get(
            collapseScreenScraperTitlePunctuation(
              targetNameForRanking,
            ).toLowerCase(),
            collapseScreenScraperTitlePunctuation(rTitle).toLowerCase(),
          );
          if (
            matchScore > bestMatchScore ||
            (matchScore === bestMatchScore && dist < minDist)
          ) {
            bestMatchScore = matchScore;
            minDist = dist;
            bestId = r.id;
          }
        }

        if (
          bestMatchScore < SCREENSCRAPER_TITLE_MATCH_MIN_SCORE &&
          screenScraperSignificantTokens(
            targetNameForRanking,
            deps.cleanSearchQuery,
          ).size >= 2
        ) {
          console.info(
            `[ScreenScraper] No sufficiently specific match for "${name}" (best score ${bestMatchScore.toFixed(2)})`,
          );
          return null;
        }

        const infoRes = await fetchScreenScraperGameById(
          baseParams,
          Number(bestId),
          credentials,
          options,
        );
        if (infoRes) {
          gameData = infoRes;
          resolvedSystemId = systemeid;
        }
      }

      if (!gameData) {
        console.info(`[ScreenScraper] Could not fetch game data for "${name}"`);
        return null;
      }

      const title =
        pickSSTitleForTarget(gameData.noms, name) ||
        pickSSTitle(gameData.noms) ||
        name;
      const description = pickSSSynopsis(gameData.synopsis);
      const imageUrl = gameData.medias ? pickSSCover(gameData.medias) : null;
      const releaseDate = gameData.dates?.[0]?.text ?? undefined;
      const publisherName =
        gameData.editeur?.text ?? gameData.developpeur?.text;
      const facts = buildScreenScraperFacts(gameData, deps.formatScore);

      const attachments: MetadataAttachment[] = [];

      const resolvedPlatformKey =
        getPlatformKeyFromSSSystemId(resolvedSystemId) ||
        getPlatformKeyFromSSSystemId(Number(gameData.systeme?.id)) ||
        getPlatformKeyFromSSMediaUrl(imageUrl);

      if (gameData.medias) {
        gameData.medias.forEach((m) => {
          // Drop ScreenScraper's tiny "no image" placeholders (see helper).
          if (isScreenScraperPlaceholderMedia(m)) return;

          const semantics = screenScraperMediaAttachmentSemantics(m);

          if (semantics) {
            attachments.push({
              type: semantics.type,
              role: semantics.role,
              url: m.url,
              source: "screenscraper",
              platformKey:
                resolvedPlatformKey || getPlatformKeyFromSSMediaUrl(m.url),
            });
          }
        });
      }

      const aliases = gameData.noms
        ? Array.from(
            new Set(
              gameData.noms.map((n) => repairCatalogColonSubstitute(n.text)),
            ),
          ).filter((n) => n.toLowerCase().trim() !== title.toLowerCase().trim())
        : undefined;
      const regionalTitles = gameData.noms
        ? gameData.noms
            .filter((n) => n.text)
            .map((n) => ({
              region: n.region,
              text: repairCatalogColonSubstitute(n.text),
            }))
        : undefined;

      const result: MetadataResult = withMetadataPlatformKeys(
        {
          title,
          platformKey:
            resolvedPlatformKey || getPlatformKeyFromSSMediaUrl(imageUrl),
          description,
          imageUrl: imageUrl ?? undefined,
          releaseDate,
          publishers: publisherName ? [{ name: publisherName }] : undefined,
          attachments,
          aliases,
          regionalTitles,
          facts: facts.length > 0 ? facts : undefined,
          externalIds: gameData.id
            ? { screenscraper: String(gameData.id) }
            : undefined,
        },
        resolvedPlatformKey,
      );

      if (gameData.id) {
        await persistScreenScraperGameIdForBarcode(
          barcode,
          gameData.id,
          result.imageUrl,
        );
      }

      return withScreenScraperObservations(result, {
        sourceUrl: gameData.id
          ? buildScreenScraperGamePageUrl(
              gameData.id,
              resolvedSystemId || Number(gameData.systeme?.id) || null,
            )
          : undefined,
        hasBarcodeMatch: resolvedFromBarcodeEvidence,
        hasPlatformMatch: !!(
          systemeid &&
          resolvedSystemId &&
          systemeid === resolvedSystemId
        ),
      });
    } catch (err) {
      console.error(
        `[ScreenScraper] Unexpected error for "${name || barcode}": ${err}`,
      );
      return null;
    }
  }

  // A cached lookup is keyed by the query, but it stores whatever the resolver
  // returned at the time — including a wrong game from a stale/poisoned entry.
  // Only trust it when its title still matches the requested one; otherwise
  // re-resolve so the (now title-validated) resolution path can correct it.
  const isCachedLookupAcceptable = (
    requestedName: string,
    cached: MetadataResult,
  ): boolean => {
    if (
      requestedName &&
      cached.title &&
      !areLikelySameProduct(requestedName, cached.title)
    ) {
      return false;
    }
    return (
      metadataHasDisplayImage(cached) ||
      Boolean(cached.externalIds?.screenscraper?.trim())
    );
  };

  const serveCachedScreenScraperLookup = async (
    cached: MetadataResult,
    lookupKey: string,
    requestedName: string,
    label: string,
  ): Promise<MetadataResult> => {
    const signatureBefore = screenScraperLookupAttachmentSignature(cached);
    const hydrated = await hydrateScreenScraperLookupFromGameCache(
      cached,
      requestedName,
    );
    const normalized = withScreenScraperObservations(hydrated);
    const signatureAfter = screenScraperLookupAttachmentSignature(normalized);
    if (signatureAfter !== signatureBefore) {
      cacheScreenScraperLookup(lookupKey, normalized);
      console.info(
        `[ScreenScraper] Upgraded lookup cache for game ${cached.externalIds?.screenscraper} (${label})`,
      );
    } else {
      console.info(`[ScreenScraper] Lookup cache hit for "${label}"`);
    }
    return normalized;
  };

  return async function fetchFromScreenScraper(
    name: string,
    barcode?: string | null,
    platform?: string | null,
    options?: {
      isBackground?: boolean;
      signal?: AbortSignal;
      lookupQueries?: string[];
    },
  ): Promise<MetadataResult | null> {
    const lookupKey = buildScreenScraperLookupKey(name, barcode, platform);

    if (isScreenScraperLookupMissCached(lookupKey)) {
      return null;
    }

    const persisted = await getPersistedScreenScraperLookup(lookupKey);
    if (persisted) {
      const normalizedPersisted = withScreenScraperObservations(persisted);
      if (isCachedLookupAcceptable(name, normalizedPersisted)) {
        return serveCachedScreenScraperLookup(
          normalizedPersisted,
          lookupKey,
          name,
          name || barcode || lookupKey,
        );
      }
      console.info(
        `[ScreenScraper] Ignoring cached lookup "${persisted.title}" — does not match requested "${name}"`,
      );
    }

    if (isScreenScraperQuotaBlocked()) {
      const stale = await getPersistedScreenScraperLookup(lookupKey, {
        allowStale: true,
      });
      const normalizedStale = stale
        ? withScreenScraperObservations(stale)
        : null;
      if (normalizedStale && isCachedLookupAcceptable(name, normalizedStale)) {
        console.warn(
          `[ScreenScraper] Quota cooldown — serving stale lookup for "${name || barcode}"`,
        );
        return serveCachedScreenScraperLookup(
          normalizedStale,
          lookupKey,
          name,
          name || barcode || lookupKey,
        );
      }
    }

    const inFlight = getScreenScraperInFlightLookup(lookupKey);
    if (inFlight) return inFlight;

    const promise = resolveScreenScraperMetadata(
      name,
      barcode,
      platform,
      options,
    );
    setScreenScraperInFlightLookup(lookupKey, promise);

    try {
      const result = await promise;
      const normalizedResult = result
        ? withScreenScraperObservations(result)
        : null;
      if (normalizedResult) {
        cacheScreenScraperLookup(lookupKey, normalizedResult);
      } else {
        markScreenScraperLookupMiss(lookupKey);
      }
      return normalizedResult;
    } finally {
      clearScreenScraperInFlightLookup(lookupKey);
    }
  };
}
