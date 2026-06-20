import axios from "axios";
import { prisma } from "@/lib/prisma";
import levenshtein from "fast-levenshtein";
import type { AttachmentType } from "@prisma/client";
import { retry } from "@/lib/retry";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
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
import { parseScreenScraperMediaUrl } from "./mediaUrl";

export { parseScreenScraperMediaUrl } from "./mediaUrl";

/**
 * Maps a RAWG platform name to a ScreenScraper system ID.
 * Only the most common modern platforms are listed; omitting = fall through to search.
 */
const RAWG_PLATFORM_TO_SS_SYSTEM: Record<string, number> = {
  "PlayStation 5": 284,
  "PlayStation 4": 60,
  "PlayStation 3": 59,
  "PlayStation 2": 58,
  PlayStation: 57,
  "Xbox One": 34,
  "Xbox Series S/X": 34,
  "Xbox 360": 33,
  Xbox: 32,
  "Nintendo Switch": 225,
  "Nintendo 3DS": 17,
  "Nintendo DS": 15,
  "Wii U": 18,
  Wii: 16,
  PC: 138,
  "PC (Windows)": 138,
};

const SS_SYSTEM_TO_PLATFORM_KEY: Record<number, string> = {
  15: "ds",
  16: "wii",
  17: "3ds",
  18: "wiiu",
  32: "xbox",
  33: "xbox360",
  34: "xboxone",
  57: "ps1",
  58: "ps2",
  59: "ps3",
  60: "ps4",
  138: "pc",
  225: "switch",
  284: "ps5",
};

function getPlatformKeyFromSSSystemId(systemId?: number): string | undefined {
  if (!systemId) return undefined;
  return SS_SYSTEM_TO_PLATFORM_KEY[systemId];
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
}

export interface SSGame {
  id?: number;
  systeme?: { id?: number | string; text?: string };
  noms?: { region: string; text: string }[];
  synopsis?: { langue: string; text: string }[];
  dates?: { region: string; text: string }[];
  editeur?: { text: string };
  developpeur?: { text: string };
  note?: { text: string };
  classifications?: { type?: string; text?: string }[];
  medias?: SSMedia[];
}

/**
 * Picks the best cover image URL from ScreenScraper medias array.
 * Prefers a true front cover first, then the best region inside that type.
 * This keeps box-2D(eu) above decorative mix images such as mixrbv2(fr).
 */
export function pickSSCover(medias: SSMedia[]): string | null {
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
  const exact = RAWG_PLATFORM_TO_SS_SYSTEM[name];
  if (exact) return exact;

  const lower = name.toLowerCase().replace(/[._-]+/g, " ");
  const has = (pattern: RegExp) => pattern.test(lower);

  if (has(/\bpsp\b|\bplaystation\s+portable\b/)) return 61;
  if (has(/\bvita\b/) || has(/\bplaystation\s+vita\b/) || has(/\bps\s+vita\b/))
    return 62;
  if (has(/\bps5\b|\bplaystation\s+5\b/)) return 284;
  if (has(/\bps4\b|\bplaystation\s+4\b/)) return 60;
  if (has(/\bps3\b|\bplaystation\s+3\b/)) return 59;
  if (has(/\bps2\b|\bplaystation\s+2\b/)) return 58;
  if (has(/\bps1\b/) || has(/\bplaystation\s+1\b/) || has(/\bplaystation\b/))
    return 57;
  if (
    has(/\bxbox\s+series\b/) ||
    has(/\bxbox\s+sx\b/) ||
    has(/\bxbox\s+s\/x\b/)
  )
    return 34;
  if (has(/\bxbox\s+one\b|\bxboxone\b/)) return 34;
  if (has(/\bxbox\s+360\b|\bxbox360\b/)) return 33;
  if (has(/\bxbox\b/)) return 32;
  if (has(/\bswitch\b|\bnintendo\s+switch\b/)) return 225;
  if (has(/\b3ds\b|\bnintendo\s+3ds\b/)) return 17;
  if (has(/\bds\b|\bnds\b|\bnintendo\s+ds\b/)) return 15;
  if (has(/\bwii\s+u\b|\bwiiu\b/)) return 18;
  if (has(/\bwii\b/)) return 16;
  if (has(/\bpc\b|\bwindows\b/)) return 138;
  if (has(/\bgamecube\b/) || has(/\bgame\s+cube\b/) || has(/\bgcn\b/))
    return 13;
  if (has(/\bdreamcast\b/)) return 23;
  if (has(/\bn64\b|\bnintendo\s+64\b/)) return 14;
  if (has(/\bsuper\s+nintendo\b/) || has(/\bsnes\b/) || has(/\bsuper\s+nes\b/))
    return 4;
  if (has(/\bnes\b|\bnintendo\s+entertainment\s+system\b/)) return 3;
  if (has(/\bgame\s+boy\s+advance\b|\bgba\b/)) return 12;
  if (has(/\bgame\s+boy\s+color\b|\bgbc\b/)) return 10;
  if (has(/\bgame\s+boy\b/) || has(/\bgameboy\b/) || has(/\bgb\b/)) return 9;
  if (has(/\bmega\s+drive\b/) || has(/\bmegadrive\b/) || has(/\bgenesis\b/))
    return 21;
  if (has(/\bmaster\s+system\b|\bmastersystem\b/)) return 2;
  if (has(/\bgame\s+gear\b|\bgamegear\b/)) return 22;
  if (has(/\bneo\s+geo\b|\bneogeo\b/)) return 24;
  if (has(/\batari\s+2600\b/) || has(/\batari2600\b/)) return 26;
  return undefined;
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
): Promise<{ gameId: number; systemId?: number } | null> {
  const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
  if (!cleanedBarcode) return null;

  const cached = await prisma.barcodeCache.findUnique({
    where: { barcode: cleanedBarcode },
    include: { rawNames: true },
  });
  if (!cached?.rawNames.length) return null;

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
      variants.push(subtitleSplit[1].trim(), subtitleSplit[2].trim());
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
      const stale = getCachedScreenScraperSearch(query, systemeid);
      if (stale) return stale;
    }
    throw error;
  }
}

type ScreenScraperResolverDeps = {
  cleanSearchQuery: (name: string) => string;
  formatScore: (value: number, scale: number) => string | null;
};

function buildScreenScraperFacts(
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

  return facts;
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
      if (!systemeid && name) {
        systemeid = detectSystemIdFromName(name);
      }

      if (barcode) {
        const cachedGame = await resolveScreenScraperGameIdFromBarcodeCache(
          barcode,
          systemeid,
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
                gameData = jeu;
                resolvedSystemId = systemeid;
                console.info(
                  `[ScreenScraper] Successfully found game by barcode search "${cleanedBarcode}"`,
                );
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
          const firstWord = cleanedName.split(/\s+/)[0];
          if (
            firstWord &&
            firstWord.length >= 3 &&
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
          let type: AttachmentType | null = null;
          let role: string | null = null;

          if (m.type === "box-2D") {
            type = "cover";
            role = m.region || "wor";
          } else if (m.type === "box-3D") {
            type = "cover";
            role = m.region ? `3d-${m.region}` : "3d-wor";
          } else if (m.type === "box-2D-back" || m.type === "box-back") {
            type = "image";
            role = m.region ? `back-${m.region}` : "back";
          } else if (m.type === "support-2D" || m.type === "support-texture") {
            type = "image";
            role = m.region ? `disc-${m.region}` : "disc";
          } else if (m.type === "ss") {
            type = "screenshot";
            role = m.region || "wor";
          } else if (m.type === "sstitle") {
            type = "screenshot";
            role = "title";
          } else if (m.type === "wheel") {
            type = "logo";
          }

          if (type) {
            attachments.push({
              type,
              role: role || undefined,
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
      };

      if (gameData.id) {
        await persistScreenScraperGameIdForBarcode(
          barcode,
          gameData.id,
          resolvedSystemId,
          result.imageUrl,
        );
      }

      return result;
    } catch (err) {
      console.error(
        `[ScreenScraper] Unexpected error for "${name || barcode}": ${err}`,
      );
      return null;
    }
  }

  return async function fetchFromScreenScraper(
    name: string,
    barcode?: string | null,
    platform?: string | null,
    options?: { isBackground?: boolean },
  ): Promise<MetadataResult | null> {
    const lookupKey = buildScreenScraperLookupKey(name, barcode, platform);

    const persisted = await getPersistedScreenScraperLookup(lookupKey);
    if (persisted) {
      console.info(`[ScreenScraper] Lookup cache hit for "${name || barcode}"`);
      return persisted;
    }

    if (isScreenScraperQuotaBlocked()) {
      const stale = await getPersistedScreenScraperLookup(lookupKey, {
        allowStale: true,
      });
      if (stale) {
        console.warn(
          `[ScreenScraper] Quota cooldown — serving stale lookup for "${name || barcode}"`,
        );
        return stale;
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
      if (result) {
        cacheScreenScraperLookup(lookupKey, result);
      }
      return result;
    } finally {
      clearScreenScraperInFlightLookup(lookupKey);
    }
  };
}
