import axios from "axios";
import { prisma } from "@/lib/prisma";
import levenshtein from "fast-levenshtein";
import type { AttachmentType } from "@prisma/client";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

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
  if (has(/\batari\s+2600\b/) || has(/\batari2600\b/) || has(/\batari\b/))
    return 26;
  if (has(/\bpsp\b|\bplaystation\s+portable\b/)) return 61;
  if (has(/\bvita\b/) || has(/\bplaystation\s+vita\b/) || has(/\bps\s+vita\b/))
    return 62;
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
        !["pour", "avec", "sans", "sur", "force"].includes(token),
    );

  return new Set(tokens);
}

function isPlausibleScreenScraperFallbackResult(
  originalName: string,
  resultName: string,
  cleanSearchQuery: (name: string) => string,
): boolean {
  const originalTokens = screenScraperSignificantTokens(
    originalName,
    cleanSearchQuery,
  );
  const resultTokens = screenScraperSignificantTokens(resultName, cleanSearchQuery);
  if (originalTokens.size <= 1) return true;

  const overlap = [...originalTokens].filter((token) => resultTokens.has(token));
  return overlap.length >= Math.min(2, originalTokens.size);
}

function buildScreenScraperSearchQueries(
  name: string,
  cleanSearchQuery: (name: string) => string,
): string[] {
  const cleanedName = cleanSearchQuery(name);
  const bases = uniqueScreenScraperSearchQueries([cleanedName, name]);
  const variants: string[] = [];

  for (const base of bases) {
    variants.push(
      base,
      base.replace(/\s*:\s*/g, " : "),
      base.replace(/\s*:\s*/g, ": "),
      base.replace(/\s*[-–—]\s*/g, " : "),
      base.replace(/\s*[-–—]\s*/g, ": "),
      base.replace(/\s*:\s*/g, " - "),
      base.replace(/\s*[:\-–—]\s*/g, " "),
      base.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    );
  }

  return uniqueScreenScraperSearchQueries(variants).slice(0, 8);
}

async function searchScreenScraperGames(
  baseParams: Record<string, string>,
  query: string,
  systemeid?: number,
): Promise<any[]> {
  const searchRes = await axios.get<{
    response: { jeux: any };
  }>("https://api.screenscraper.fr/api2/jeuRecherche.php", {
    params: {
      ...baseParams,
      recherche: query,
      ...(systemeid ? { systemeid: String(systemeid) } : {}),
    },
    timeout: 8000,
  });

  let results = searchRes.data?.response?.jeux;
  if (results && !Array.isArray(results)) {
    results = [results];
  }

  return (results || []).filter((r: any) => r && r.id);
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
  return async function fetchFromScreenScraper(
    name: string,
    barcode?: string | null,
    platform?: string | null,
  ): Promise<MetadataResult | null> {
    const devId = process.env.SCREENSCRAPER_DEV_ID;
    const devPass = process.env.SCREENSCRAPER_DEV_PASSWORD;

    if (!devId || !devPass) {
      console.info("[ScreenScraper] Not configured");
      return null;
    }

    const ssUser = process.env.SCREENSCRAPER_USER || "";
    const ssPass = process.env.SCREENSCRAPER_PASSWORD || "";

    const baseParams: Record<string, string> = {
      devid: devId,
      devpassword: devPass,
      softname: "Placarr",
      output: "json",
      ...(ssUser && ssPass ? { ssid: ssUser, sspassword: ssPass } : {}),
    };

    try {
      let gameData: SSGame | null = null;
      let systemeid = platform ? detectSystemIdFromName(platform) : undefined;
      let resolvedSystemId: number | undefined;
      if (!systemeid && name) {
        systemeid = detectSystemIdFromName(name);
      }

      if (barcode && systemeid !== undefined && systemeid > 0) {
        const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
        if (cleanedBarcode.length > 0) {
          try {
            const res = await axios.get<{ response: { jeu: SSGame } }>(
              "https://api.screenscraper.fr/api2/jeuInfos.php",
              {
                params: {
                  ...baseParams,
                  crc: "",
                  md5: "",
                  sha1: "",
                  systemeid: String(systemeid),
                  romtype: "rom",
                  romnom: cleanedBarcode,
                  romtaille: "",
                },
                timeout: 8000,
              },
            );
            const jeu = res.data?.response?.jeu;
            if (jeu && jeu.id) {
              gameData = jeu;
              resolvedSystemId = systemeid;
              console.info(
                `[ScreenScraper] Successfully found game by barcode "${cleanedBarcode}": "${pickSSTitle(jeu.noms) || name || ""}"`,
              );
            }
          } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
              console.info(
                `[ScreenScraper] No direct barcode match for "${cleanedBarcode}", trying name fallback`,
              );
            } else {
              console.error(
                `[ScreenScraper] Error looking up barcode "${cleanedBarcode}":`,
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

        if (!validResults || validResults.length === 0) {
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
                    .filter(
                      (value) =>
                        value &&
                        !hasCachedCandidateSystemConflict(value, systemeid),
                    )
                    .filter((v, i, self) => v && self.indexOf(v) === i);

                  for (const cand of candidates) {
                    if (cand.toLowerCase() === cleanedName.toLowerCase()) continue;
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
              console.error(`[ScreenScraper] Fallback search error:`, err.message);
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
        for (const r of rankedResults) {
          const rTitle = pickSSTitle(r.noms)?.toLowerCase() || "";
          const dist = levenshtein.get(searchNameUsed.toLowerCase(), rTitle);
          if (dist < minDist) {
            minDist = dist;
            bestId = r.id;
          }
        }

        const infoRes = await axios.get<{ response: { jeu: SSGame } }>(
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
              gameid: String(bestId),
            },
            timeout: 8000,
          },
        );
        const jeu = infoRes.data?.response?.jeu;
        if (jeu && jeu.id) {
          gameData = jeu;
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
      const publisherName = gameData.editeur?.text ?? gameData.developpeur?.text;
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
            role = m.region ? `${m.region}-3d` : "wor-3d";
          } else if (m.type === "box-2D-back" || m.type === "box-back") {
            type = "image";
            role = m.region ? `${m.region}-back` : "back";
          } else if (m.type === "support-2D" || m.type === "support-texture") {
            type = "image";
            role = m.region ? `${m.region}-support` : "support";
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

      return {
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
    } catch (err) {
      console.error(
        `[ScreenScraper] Unexpected error for "${name || barcode}": ${err}`,
      );
      return null;
    }
  };
}
