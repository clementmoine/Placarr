import axios from "axios";
import { prisma } from "@/lib/db/prisma";
import levenshtein from "fast-levenshtein";
import { retry } from "@/lib/http/retry";
import {
  makeObservationUsage,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/lib/metadata/observations";
import {
  detectScreenScraperSystemId,
  getPlatformKeyByScreenScraperSystemId,
} from "@/lib/games/platforms";

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
  isScreenScraperQuotaBlocked,
  markScreenScraperQuotaHit,
  persistScreenScraperGameIdForBarcode,
  setScreenScraperInFlightLookup,
} from "./cache";
import {
  parseScreenScraperMediaUrl,
  screenScraperMediaAttachmentSemantics,
} from "./mediaUrl";
import { areLikelySameProduct } from "@/lib/barcode/titleUtils";
import { isWeakMetadataSearchFragment } from "@/lib/title/searchVariants";
import { metadataHasDisplayImage } from "@/lib/metadata/displayImage";

export { parseScreenScraperMediaUrl } from "./mediaUrl";

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

export interface SSMedia {
  type: string;
  url: string;
  region?: string;
  format?: string;
  size?: string | number;
}

// ScreenScraper lists media it doesn't really have and serves a tiny solid
// "no image" placeholder for them (observed at 2742 bytes, e.g. box-2D-back(jp)
// on jeuid 14825). Real box art is always far larger (the smallest legitimate
// spine/side seen is ~8.7 KB), so a small `size` is a reliable, download-free
// signal to drop these before they reach the gallery or cover picker.
const SS_PLACEHOLDER_MAX_SIZE_BYTES = 4096;

export function isScreenScraperPlaceholderMedia(media: SSMedia): boolean {
  const size = Number(media.size);
  return (
    Number.isFinite(size) && size > 0 && size < SS_PLACEHOLDER_MAX_SIZE_BYTES
  );
}

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

/**
 * Picks the best cover image URL from ScreenScraper medias array.
 * Prefers a true front cover first, then the best region inside that type.
 * This keeps box-2D(eu) above decorative mix images such as mixrbv2(fr).
 */
export function pickSSCover(allMedias: SSMedia[]): string | null {
  const medias = allMedias.filter((m) => !isScreenScraperPlaceholderMedia(m));
  const preferredTypes = ["box-2D", "box-3D"];
  const regionOrder = ["fr", "eu", "wor", "us", "jp"];

  for (const type of preferredTypes) {
    for (const region of regionOrder) {
      const found = medias.find((m) => m.type === type && m.region === region);
      if (found) return found.url;
    }
  }

  for (const type of preferredTypes) {
    const found = medias.find((m) => m.type === type);
    if (found) return found.url;
  }

  return null;
}

function pickSSTitle(noms?: SSGame["noms"]): string | undefined {
  if (!noms || noms.length === 0) return undefined;
  const regionOrder = ["fr", "eu", "wor", "uk", "us", "jp"];
  const regionRank = (region?: string) => {
    const index = regionOrder.indexOf((region || "").toLowerCase());
    return index === -1 ? regionOrder.length : index;
  };

  return noms
    .slice()
    .sort((a, b) => regionRank(a.region) - regionRank(b.region))[0]?.text;
}

function pickSSSynopsis(synopsis?: SSGame["synopsis"]): string | undefined {
  if (!synopsis || synopsis.length === 0) return undefined;
  const langOrder = ["fr", "en"];
  for (const lang of langOrder) {
    const found = synopsis.find((s) => s.langue === lang);
    if (found) return found.text;
  }
  return synopsis[0].text;
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
    axios.isAxiosError(error) &&
    (error.response?.status === 430 || error.response?.status === 429)
  );
}

async function fetchScreenScraperGameById(
  baseParams: Record<string, string>,
  gameId: number,
  credentials: ScreenScraperEnv,
  options?: { isBackground?: boolean },
): Promise<SSGame | null> {
  const cached = await getCachedScreenScraperGame(gameId);
  if (cached) {
    console.info(`[ScreenScraper] Cache hit for game ${gameId}`);
    return cached;
  }

  try {
    const queryFn = () =>
      axios.get<{ response: { jeu: SSGame } }>(
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
          timeout: 8000,
        },
      );

    const infoRes = options?.isBackground
      ? await retry(queryFn, 3, 1500)
      : await queryFn();

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
  return value.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

function uniqueScreenScraperSearchQueries(values: string[]): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];

  for (const value of values) {
    const normalized = normalizeScreenScraperSearchQuery(value);
    if (normalized.length < 2) continue;

    const key = normalized
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    queries.push(normalized);
  }

  return queries;
}

const BROAD_SCREENSCRAPER_FALLBACK_WORDS = new Set([
  "club",
  "star",
  "super",
  "the",
  "les",
  "des",
  "jeu",
  "jeux",
  "wii",
  "nintendo",
]);

const NON_DISTINCTIVE_SCREENSCRAPER_TOKENS = new Set([
  "avec",
  "bundle",
  "complete",
  "complet",
  "edition",
  "editions",
  "force",
  "pack",
  "packs",
  "pour",
  "sans",
  "standard",
  "sur",
  "ultimate",
  "version",
]);

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

export function buildScreenScraperSearchQueries(
  name: string,
  cleanSearchQuery: (name: string) => string,
): string[] {
  const cleanedName = cleanSearchQuery(name);
  const bases = uniqueScreenScraperSearchQueries([name, cleanedName]);
  const variants: string[] = [name];

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

    variants.push(
      base,
      base.replace(/\s*:\s*/g, " : "),
      base.replace(/\s*:\s*/g, ": "),
      base.replace(/\s*[-–—]\s*/g, " : "),
      base.replace(/\s*[-–—]\s*/g, ": "),
      base.replace(/\s*:\s*/g, " - "),
      base.replace(/\s*[:\-–—]\s*/g, " "),
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
  options?: { isBackground?: boolean },
): Promise<any[]> {
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
      axios.get<{
        response: { jeux: any };
      }>("https://api.screenscraper.fr/api2/jeuRecherche.php", {
        params: {
          ...baseParams,
          recherche: query,
          ...(systemeid ? { systemeid: String(systemeid) } : {}),
        },
        timeout: 8000,
      });

    const searchRes = options?.isBackground
      ? await retry(queryFn, 3, 1500)
      : await queryFn();

    let results = searchRes.data?.response?.jeux;
    if (results && !Array.isArray(results)) {
      results = [results];
    }

    const filtered = (results || []).filter((r: any) => r && r.id);
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
    | string
    | { text?: string }
    | Array<string | { text?: string }>
    | undefined,
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
const SCREEN_SCRAPER_REGION_RE = /(?:^|[-_])(fr|eu|wor|uk|us|jp)$/i;

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
  const role = attachment.role?.trim();
  if (!role) return undefined;
  const match = role.match(SCREEN_SCRAPER_REGION_RE);
  return match?.[1]?.toLowerCase();
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
  if (
    metadata.observationSchemaVersion === METADATA_OBSERVATION_SCHEMA_VERSION &&
    (metadata.observations?.length || 0) > 0
  ) {
    return metadata;
  }

  return {
    ...metadata,
    observations: buildScreenScraperObservations(metadata, {
      sourceUrl: context.sourceUrl,
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
    options?: { isBackground?: boolean },
  ): Promise<MetadataResult | null> {
    const credentials = getScreenScraperEnv();

    if (!credentials) {
      console.info("[ScreenScraper] Not configured");
      return null;
    }

    const baseParams: Record<string, string> = {
      devid: credentials.devId,
      devpassword: credentials.devPass,
      softname: "Placarr",
      output: "json",
      ...(credentials.ssUser && credentials.ssPass
        ? { ssid: credentials.ssUser, sspassword: credentials.ssPass }
        : {}),
    };

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

      if (!gameData && barcode && systemeid !== undefined && systemeid > 0) {
        const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
        if (cleanedBarcode.length > 0) {
          try {
            const barcodeResults = await searchScreenScraperGames(
              baseParams,
              cleanedBarcode,
              systemeid,
              options,
            );
            if (barcodeResults.length === 1 && barcodeResults[0]?.id) {
              const jeu = await fetchScreenScraperGameById(
                baseParams,
                Number(barcodeResults[0].id),
                credentials,
                options,
              );
              if (jeu) {
                // ScreenScraper's serial/barcode index can return a different
                // game than the one being identified (a wrong barcode→game
                // mapping). Only trust the hit when its title matches the
                // requested one; otherwise fall through to the title-driven
                // name search below, so a bad mapping never wins.
                const jeuTitle = pickSSTitle(jeu.noms) || "";
                if (name && jeuTitle && !areLikelySameProduct(name, jeuTitle)) {
                  console.info(
                    `[ScreenScraper] Ignoring barcode-search hit "${jeuTitle}" — does not match requested "${name}"`,
                  );
                } else {
                  gameData = jeu;
                  resolvedSystemId = systemeid;
                  resolvedFromBarcodeEvidence = true;
                  console.info(
                    `[ScreenScraper] Successfully found game by barcode search "${cleanedBarcode}"`,
                  );
                }
              }
            }
          } catch (error) {
            if (isScreenScraperQuotaError(error)) {
              console.warn(
                `[ScreenScraper] Quota exceeded during barcode search for "${cleanedBarcode}"`,
              );
            } else if (
              axios.isAxiosError(error) &&
              error.response?.status === 404
            ) {
              console.info(
                `[ScreenScraper] No barcode search match for "${cleanedBarcode}"`,
              );
            } else {
              console.error(
                `[ScreenScraper] Error searching barcode "${cleanedBarcode}":`,
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

        let validResults: any[] = [];
        for (const query of buildScreenScraperSearchQueries(
          name,
          deps.cleanSearchQuery,
        )) {
          if (isScreenScraperQuotaBlocked()) break;
          try {
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
          } catch (err: any) {
            console.error(
              `[ScreenScraper] Search error for "${query}":`,
              err.message,
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

                  for (const cand of candidates) {
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
                      try {
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
                      } catch (err: any) {
                        console.error(
                          `[ScreenScraper] Cached suggestion search error for "${query}":`,
                          err.message,
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
              validResults = fallbackResults.filter((result: any) =>
                isPlausibleScreenScraperFallbackResult(
                  cleanedName,
                  pickSSTitle(result.noms) || "",
                  deps.cleanSearchQuery,
                ),
              );
              if (validResults.length > 0) {
                searchNameUsed = firstWord;
              }
            } catch (err: any) {
              console.error(
                `[ScreenScraper] Fallback search error:`,
                err.message,
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

        const platformCompatibleResults = systemeid
          ? validResults.filter((r: any) => {
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

        const targetNameForRanking =
          name.trim() || cleanedName || searchNameUsed;
        let bestId = rankedResults[0].id;
        let minDist = Infinity;
        let bestOverlap = -1;
        const rankingTokens = screenScraperSignificantTokens(
          targetNameForRanking,
          deps.cleanSearchQuery,
        );
        for (const r of rankedResults) {
          const rTitle = pickSSTitle(r.noms) || "";
          const resultTokens = screenScraperSignificantTokens(
            rTitle,
            deps.cleanSearchQuery,
          );
          const overlap = [...rankingTokens].filter((token) =>
            resultTokens.has(token),
          ).length;
          const dist = levenshtein.get(
            targetNameForRanking.toLowerCase(),
            rTitle.toLowerCase(),
          );
          if (
            overlap > bestOverlap ||
            (overlap === bestOverlap && dist < minDist)
          ) {
            bestOverlap = overlap;
            minDist = dist;
            bestId = r.id;
          }
        }

        if (
          rankingTokens.size >= 2 &&
          bestOverlap < Math.min(2, rankingTokens.size)
        ) {
          console.info(
            `[ScreenScraper] No sufficiently specific match for "${name}" (best overlap ${bestOverlap}/${rankingTokens.size})`,
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

      const title = pickSSTitle(gameData.noms) || name;
      const description = pickSSSynopsis(gameData.synopsis);
      const imageUrl = gameData.medias ? pickSSCover(gameData.medias) : null;
      const releaseDate = gameData.dates?.[0]?.text ?? undefined;
      const publisherName =
        gameData.editeur?.text ?? gameData.developpeur?.text;
      const facts = buildScreenScraperFacts(gameData, deps.formatScore);

      const attachments: MetadataAttachment[] = [];

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
            });
          }
        });
      }

      const aliases = gameData.noms
        ? Array.from(new Set(gameData.noms.map((n) => n.text))).filter(
            (n) => n.toLowerCase().trim() !== title.toLowerCase().trim(),
          )
        : undefined;
      const regionalTitles = gameData.noms
        ? gameData.noms
            .filter((n) => n.text)
            .map((n) => ({ region: n.region, text: n.text }))
        : undefined;

      const result: MetadataResult = {
        title,
        platformKey:
          getPlatformKeyFromSSSystemId(resolvedSystemId) ||
          getPlatformKeyFromSSMediaUrl(imageUrl),
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
      };

      if (gameData.id) {
        await persistScreenScraperGameIdForBarcode(
          barcode,
          gameData.id,
          resolvedSystemId,
          result.imageUrl,
        );
      }

      return withScreenScraperObservations(result, {
        sourceUrl: gameData.id
          ? `https://api.screenscraper.fr/api2/jeuInfos.php?gameid=${gameData.id}`
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
    return metadataHasDisplayImage(cached);
  };

  return async function fetchFromScreenScraper(
    name: string,
    barcode?: string | null,
    platform?: string | null,
    options?: { isBackground?: boolean },
  ): Promise<MetadataResult | null> {
    const lookupKey = buildScreenScraperLookupKey(name, barcode, platform);

    const persisted = await getPersistedScreenScraperLookup(lookupKey);
    if (persisted) {
      const normalizedPersisted = withScreenScraperObservations(persisted);
      if (isCachedLookupAcceptable(name, normalizedPersisted)) {
        console.info(
          `[ScreenScraper] Lookup cache hit for "${name || barcode}"`,
        );
        return normalizedPersisted;
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
        return normalizedStale;
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
      }
      return normalizedResult;
    } finally {
      clearScreenScraperInFlightLookup(lookupKey);
    }
  };
}
