/**
 * IGDB (Internet Game Database) service
 * Authentication: Twitch OAuth2 client_credentials flow
 * Token is cached in the Setting table and refreshed automatically on expiry.
 *
 * Env vars required:
 *   IGDB_CLIENT_ID     — from dev.twitch.tv/console/apps
 *   IGDB_CLIENT_SECRET — from dev.twitch.tv/console/apps
 */

import axios from "axios";
import { prisma } from "@/lib/db/prisma";
import levenshtein from "fast-levenshtein";
import type {
  MetadataAttachment,
  MetadataFact,
} from "@/types/metadataProvider";

const IGDB_BASE = "https://api.igdb.com/v4";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TOKEN_KEY = "igdb_access_token";
const TOKEN_EXPIRY_KEY = "igdb_token_expiry";

// ─── Token management ────────────────────────────────────────────────────────

async function getToken(
  options: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (!options.forceRefresh) {
    // Check cached token
    const [tokenRow, expiryRow] = await Promise.all([
      prisma.setting.findUnique({ where: { key: TOKEN_KEY } }),
      prisma.setting.findUnique({ where: { key: TOKEN_EXPIRY_KEY } }),
    ]);

    const now = Date.now();
    const expiry = expiryRow ? parseInt(expiryRow.value, 10) : 0;

    if (tokenRow?.value && expiry > now + 60_000) {
      return tokenRow.value;
    }
  }

  // Fetch new token
  try {
    const now = Date.now();
    const res = await axios.post<{
      access_token: string;
      expires_in: number;
    }>(TWITCH_TOKEN_URL, null, {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      },
      timeout: 6000,
    });

    const { access_token, expires_in } = res.data;
    const newExpiry = now + expires_in * 1000;

    await Promise.all([
      prisma.setting.upsert({
        where: { key: TOKEN_KEY },
        create: { key: TOKEN_KEY, value: access_token },
        update: { value: access_token },
      }),
      prisma.setting.upsert({
        where: { key: TOKEN_EXPIRY_KEY },
        create: { key: TOKEN_EXPIRY_KEY, value: String(newExpiry) },
        update: { value: String(newExpiry) },
      }),
    ]);

    return access_token;
  } catch (err) {
    console.error(
      `[IGDB] Failed to fetch Twitch token: ${describeIGDBError(err)}`,
    );
    return null;
  }
}

async function clearCachedToken(): Promise<void> {
  try {
    await prisma.setting.deleteMany({
      where: { key: { in: [TOKEN_KEY, TOKEN_EXPIRY_KEY] } },
    });
  } catch (err) {
    console.warn(
      `[IGDB] Failed to clear cached token: ${describeIGDBError(err)}`,
    );
  }
}

async function refreshTokenAfterUnauthorized(): Promise<string | null> {
  await clearCachedToken();
  return getToken({ forceRefresh: true });
}

function igdbHeaders(token: string): Record<string, string> {
  return {
    "Client-ID": process.env.IGDB_CLIENT_ID!,
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

function isUnauthorizedIGDBError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 401;
}

function describeIGDBError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const responseMessage =
      typeof err.response?.data === "object" &&
      err.response?.data &&
      "message" in err.response.data
        ? String(err.response.data.message)
        : null;
    return [status ? `HTTP ${status}` : null, responseMessage || err.message]
      .filter(Boolean)
      .join(" - ");
  }

  return err instanceof Error ? err.message : String(err);
}

// ─── Image URL helpers ────────────────────────────────────────────────────────

type IGDBImageSize =
  | "cover_small"
  | "cover_big"
  | "screenshot_med"
  | "screenshot_big"
  | "screenshot_huge"
  | "thumb"
  | "micro"
  | "720p"
  | "1080p";

function igdbImageUrl(imageId: string, size: IGDBImageSize): string {
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface IGDBGame {
  id: number;
  name: string;
  category?: number;
  alternative_names?: { id: number; name: string }[];
  summary?: string;
  first_release_date?: number; // Unix timestamp
  rating?: number;
  rating_count?: number;
  aggregated_rating?: number;
  aggregated_rating_count?: number;
  total_rating?: number;
  total_rating_count?: number;
  cover?: { id: number; image_id: string };
  platforms?: { id: number; name: string }[];
  screenshots?: { id: number; image_id: string }[];
  artworks?: { id: number; image_id: string }[];
  involved_companies?: {
    id: number;
    company: { id: number; name: string };
    publisher: boolean;
    developer: boolean;
  }[];
  genres?: { id: number; name: string }[];
  age_ratings?: {
    id: number;
    category?: number;
    rating?: number;
    organization?: { id: number; name: string };
    rating_category?: { id: number; rating?: string };
  }[];
}

interface IGDBTimeToBeat {
  hastily?: number;
  normally?: number;
  completely?: number;
  count?: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface IGDBGameResult {
  title: string;
  description?: string;
  releaseDate?: string;
  publishers?: { name: string }[];
  attachments: MetadataAttachment[];
  aliases?: string[];
  facts?: MetadataFact[];
  externalIds?: {
    igdb?: string | null;
    [key: string]: string | null | undefined;
  };
}

/**
 * Search IGDB for a game by name.
 * Returns structured metadata with typed attachments (cover, screenshot, artwork).
 */
function normalizeTitleForCompare(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

const SUGGESTION_GAME_CATEGORIES = new Set([0, 8, 9, 10, 11]);

function isPrimaryGameCategory(game: IGDBGame): boolean {
  return (
    game.category === undefined || SUGGESTION_GAME_CATEGORIES.has(game.category)
  );
}

function normalizePlatformForCompare(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function platformAliases(platform?: string | null): string[] {
  if (!platform) return [];
  const normalized = normalizePlatformForCompare(platform);

  if (/\bwii u\b/.test(normalized)) return ["wii u"];
  if (/\bwii\b/.test(normalized)) return ["wii"];
  if (/\bnintendo ds\b|\bnds\b|\bds\b/.test(normalized)) {
    return ["nintendo ds"];
  }
  if (/\bnintendo 3ds\b|\b3ds\b/.test(normalized)) {
    return ["nintendo 3ds"];
  }
  if (/\bnintendo switch\b|\bswitch\b/.test(normalized)) {
    return ["nintendo switch"];
  }
  if (/\bxbox 360\b/.test(normalized)) return ["xbox 360"];
  if (/\bxbox one\b/.test(normalized)) return ["xbox one"];
  if (/\bxbox series\b/.test(normalized)) return ["xbox series x s"];
  if (/\bxbox original\b|\boriginal xbox\b|\bxbox\b/.test(normalized)) {
    return ["xbox"];
  }
  if (/\bps2\b|\bplaystation 2\b/.test(normalized)) {
    return ["playstation 2"];
  }
  if (/\bps3\b|\bplaystation 3\b/.test(normalized)) {
    return ["playstation 3"];
  }
  if (/\bps4\b|\bplaystation 4\b/.test(normalized)) {
    return ["playstation 4"];
  }
  if (/\bps5\b|\bplaystation 5\b/.test(normalized)) {
    return ["playstation 5"];
  }
  if (/\bpsp\b|\bplaystation portable\b/.test(normalized)) {
    return ["playstation portable"];
  }
  if (/\bpc\b|\bwindows\b|\bsteam\b/.test(normalized)) {
    return ["pc microsoft windows", "pc"];
  }

  return [normalized];
}

function isPlatformCompatible(
  game: IGDBGame,
  platform?: string | null,
): boolean {
  const aliases = platformAliases(platform);
  if (aliases.length === 0 || !game.platforms || game.platforms.length === 0) {
    return true;
  }

  const gamePlatforms = game.platforms.map((p) =>
    normalizePlatformForCompare(p.name),
  );
  return aliases.some((alias) => gamePlatforms.includes(alias));
}

function scoreIGDBCandidate(
  game: IGDBGame,
  query: string,
  platform?: string | null,
): number {
  const normalizedQuery = normalizeTitleForCompare(query);
  const normalizedName = normalizeTitleForCompare(game.name);
  const distance = levenshtein.get(normalizedQuery, normalizedName);
  let score = 500 - distance * 8;

  if (normalizedName === normalizedQuery) score += 1000;
  if (
    game.alternative_names?.some(
      (alt) => normalizeTitleForCompare(alt.name) === normalizedQuery,
    )
  ) {
    score += 900;
  }
  if (isPrimaryGameCategory(game)) score += 220;
  else score -= 500;
  if (isPlatformCompatible(game, platform)) score += 180;
  else score -= 500;

  if (!/\btour\b/i.test(query) && /\btour\s*:/i.test(game.name)) {
    score -= 400;
  }

  return score;
}

function rankIGDBGames(
  games: IGDBGame[],
  query: string,
  platform?: string | null,
): IGDBGame[] {
  return games
    .filter((game) => isPrimaryGameCategory(game))
    .filter((game) => isPlatformCompatible(game, platform))
    .sort(
      (a, b) =>
        scoreIGDBCandidate(b, query, platform) -
        scoreIGDBCandidate(a, query, platform),
    );
}

function mergeIGDBResults(
  ...groups: Array<IGDBGame[] | undefined>
): IGDBGame[] {
  const byId = new Map<number, IGDBGame>();
  for (const group of groups) {
    for (const game of group || []) {
      byId.set(game.id, game);
    }
  }
  return Array.from(byId.values());
}

function getIGDBSearchKeywords(name: string): string[] {
  return name
    .split(/[\s:,\-\(\)\[\]]+/)
    .map((w) => w.trim().replace(/['"“”]+/g, ""))
    .filter((w) => w.length >= 2);
}

export async function fetchFromIGDB(
  name: string,
  platform?: string | null,
): Promise<IGDBGameResult | null> {
  const token = await getToken();
  if (!token) {
    console.info(
      "[IGDB] Not configured (missing IGDB_CLIENT_ID / IGDB_CLIENT_SECRET)",
    );
    return null;
  }

  try {
    return await fetchFromIGDBWithToken(name, platform, token);
  } catch (err) {
    if (isUnauthorizedIGDBError(err)) {
      const freshToken = await refreshTokenAfterUnauthorized();
      if (freshToken) {
        try {
          return await fetchFromIGDBWithToken(name, platform, freshToken);
        } catch (retryErr) {
          console.error(
            `[IGDB] Error searching for "${name}" after token refresh: ${describeIGDBError(retryErr)}`,
          );
          return null;
        }
      }
    }

    console.error(
      `[IGDB] Error searching for "${name}": ${describeIGDBError(err)}`,
    );
    return null;
  }
}

async function fetchFromIGDBWithToken(
  name: string,
  platform: string | null | undefined,
  token: string,
): Promise<IGDBGameResult | null> {
  const headers = igdbHeaders(token);

  // Search for the game using the search endpoint
  const searchRes = await axios.post<IGDBGame[]>(
    `${IGDB_BASE}/games`,
    `fields name, category, platforms.name, alternative_names.name, summary, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, total_rating, total_rating_count, cover.image_id, screenshots.image_id, artworks.image_id, involved_companies.company.name, involved_companies.publisher, genres.name, age_ratings.category, age_ratings.rating, age_ratings.organization.name, age_ratings.rating_category.rating;
       search "${name.replace(/"/g, " ")}";
       limit 20;`,
    { headers, timeout: 8000 },
  );

  let results = searchRes.data;

  // IGDB full-text search can rank unrelated seasons/updates above the exact
  // game. Always add a stricter keyword pass and let the local ranker choose.
  const keywords = getIGDBSearchKeywords(name);
  if (keywords.length > 0) {
    const nameConditions = keywords.map((w) => `name ~ *"${w}"*`).join(" & ");
    const altConditions = keywords
      .map((w) => `alternative_names.name ~ *"${w}"*`)
      .join(" & ");
    const fallbackQuery = `fields name, category, platforms.name, alternative_names.name, summary, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, total_rating, total_rating_count, cover.image_id, screenshots.image_id, artworks.image_id, involved_companies.company.name, involved_companies.publisher, genres.name, age_ratings.category, age_ratings.rating, age_ratings.organization.name, age_ratings.rating_category.rating;
        where (${nameConditions}) | (${altConditions});
        limit 20;`;

    const fallbackRes = await axios.post<IGDBGame[]>(
      `${IGDB_BASE}/games`,
      fallbackQuery,
      { headers, timeout: 8000 },
    );
    results = mergeIGDBResults(results, fallbackRes.data);
  }

  if (!results || results.length === 0) return null;

  // Pick best match by normalized name comparison
  const normSearchName = normalizeTitleForCompare(name);
  const rankedResults = rankIGDBGames(results, name, platform);
  const candidates = rankedResults.length > 0 ? rankedResults : results;
  const game =
    candidates.find(
      (g) =>
        normalizeTitleForCompare(g.name) === normSearchName &&
        isPlatformCompatible(g, platform),
    ) ||
    candidates.find(
      (g) =>
        isPlatformCompatible(g, platform) &&
        g.alternative_names?.some(
          (an) => normalizeTitleForCompare(an.name) === normSearchName,
        ),
    ) ||
    candidates[0];

  const timeToBeat = await fetchIGDBTimeToBeat(game.id, headers);
  return parseIGDBGame(game, timeToBeat);
}

async function fetchIGDBSuggestionsWithToken(
  name: string,
  platform: string | null | undefined,
  token: string,
): Promise<string[]> {
  const headers = igdbHeaders(token);

  const searchRes = await axios.post<IGDBGame[]>(
    `${IGDB_BASE}/games`,
    `fields name, category, platforms.name, alternative_names.name;
       search "${name.replace(/"/g, " ")}";
       limit 20;`,
    { headers, timeout: 5000 },
  );

  let results = searchRes.data;

  const keywords = getIGDBSearchKeywords(name);
  if (keywords.length > 0) {
    const nameConditions = keywords.map((w) => `name ~ *"${w}"*`).join(" & ");
    const altConditions = keywords
      .map((w) => `alternative_names.name ~ *"${w}"*`)
      .join(" & ");
    const fallbackQuery = `fields name, category, platforms.name, alternative_names.name;
        where (${nameConditions}) | (${altConditions});
        limit 20;`;

    const fallbackRes = await axios.post<IGDBGame[]>(
      `${IGDB_BASE}/games`,
      fallbackQuery,
      { headers, timeout: 5000 },
    );
    results = mergeIGDBResults(results, fallbackRes.data);
  }

  if (!results) return [];

  const ranked = rankIGDBGames(results, name, platform);
  const candidates = ranked.length > 0 ? ranked : results;
  const normalizedQuery = normalizeTitleForCompare(name);
  const exactMatches = candidates.filter(
    (game) =>
      normalizeTitleForCompare(game.name) === normalizedQuery ||
      game.alternative_names?.some(
        (alt) => normalizeTitleForCompare(alt.name) === normalizedQuery,
      ),
  );
  if (exactMatches.length > 0) {
    return Array.from(new Set(exactMatches.map((g) => g.name))).slice(0, 5);
  }

  return Array.from(new Set(candidates.map((g) => g.name))).slice(0, 5);
}

async function pingIGDBWithToken(token: string): Promise<void> {
  await axios.post(`${IGDB_BASE}/games`, "fields name; limit 1;", {
    headers: igdbHeaders(token),
    timeout: 5000,
  });
}

/**
 * Search IGDB for game suggestions by name.
 * Returns up to 5 game titles.
 */
export async function getIGDBSuggestions(
  name: string,
  platform?: string | null,
): Promise<string[]> {
  const token = await getToken();
  if (!token) return [];

  try {
    return await fetchIGDBSuggestionsWithToken(name, platform, token);
  } catch (err) {
    if (isUnauthorizedIGDBError(err)) {
      const freshToken = await refreshTokenAfterUnauthorized();
      if (freshToken) {
        try {
          return await fetchIGDBSuggestionsWithToken(
            name,
            platform,
            freshToken,
          );
        } catch (retryErr) {
          console.error(
            `[IGDB] Error fetching suggestions for "${name}" after token refresh: ${describeIGDBError(retryErr)}`,
          );
          return [];
        }
      }
    }

    console.error(
      `[IGDB] Error fetching suggestions for "${name}": ${describeIGDBError(err)}`,
    );
    return [];
  }
}

/**
 * Ping IGDB to check if credentials are valid (used by admin status).
 */
export async function pingIGDB(): Promise<{
  ok: boolean;
  latency: number;
  error?: string;
}> {
  const start = Date.now();
  const token = await getToken();
  if (!token) {
    return {
      ok: false,
      latency: Date.now() - start,
      error: "No token (missing or invalid credentials)",
    };
  }
  try {
    await pingIGDBWithToken(token);
    return { ok: true, latency: Date.now() - start };
  } catch (err) {
    if (isUnauthorizedIGDBError(err)) {
      const freshToken = await refreshTokenAfterUnauthorized();
      if (freshToken) {
        try {
          await pingIGDBWithToken(freshToken);
          return { ok: true, latency: Date.now() - start };
        } catch (retryErr) {
          return {
            ok: false,
            latency: Date.now() - start,
            error: describeIGDBError(retryErr),
          };
        }
      }
    }
    return {
      ok: false,
      latency: Date.now() - start,
      error: describeIGDBError(err),
    };
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fetchIGDBTimeToBeat(
  gameId: number,
  headers: Record<string, string>,
): Promise<IGDBTimeToBeat | null> {
  try {
    const res = await axios.post<IGDBTimeToBeat[]>(
      `${IGDB_BASE}/game_time_to_beats`,
      `fields hastily, normally, completely, count; where game_id = ${gameId}; limit 1;`,
      { headers, timeout: 5000 },
    );
    return res.data?.[0] || null;
  } catch (err) {
    console.error(
      `[IGDB] Error fetching time to beat for game ${gameId}: ${describeIGDBError(err)}`,
    );
    return null;
  }
}

function formatHoursFromSeconds(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(seconds / 60)} min`;
  const rounded = Math.round(hours * 2) / 2;
  return `${rounded.toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  })} h`;
}

function formatRatingValue(value?: number): string | null {
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  return `${Math.round(value)}/100`;
}

function mapLegacyAgeOrganization(category?: number): string | null {
  const map: Record<number, string> = {
    1: "ESRB",
    2: "PEGI",
    3: "CERO",
    4: "USK",
    5: "GRAC",
    6: "CLASS_IND",
    7: "ACB",
  };
  return category ? map[category] || null : null;
}

function mapLegacyAgeRating(rating?: number): string | null {
  const map: Record<number, string> = {
    1: "3",
    2: "7",
    3: "12",
    4: "16",
    5: "18",
    6: "RP",
    7: "EC",
    8: "E",
    9: "E10+",
    10: "T",
    11: "M",
    12: "AO",
    13: "A",
    14: "B",
    15: "C",
    16: "D",
    17: "Z",
    18: "0",
    19: "6",
    20: "12",
    21: "16",
    22: "18",
    23: "All",
    24: "12",
    25: "15",
    26: "18",
    28: "L",
    29: "10",
    30: "12",
    31: "14",
    32: "16",
    33: "18",
    34: "G",
    35: "PG",
    36: "M",
    37: "MA15+",
  };
  return rating ? map[rating] || null : null;
}

function buildAgeRatingFacts(game: IGDBGame): MetadataFact[] {
  const ratings = game.age_ratings || [];
  const parsedFacts = ratings.flatMap((rating) => {
    const organization =
      rating.organization?.name || mapLegacyAgeOrganization(rating.category);
    const value =
      rating.rating_category?.rating || mapLegacyAgeRating(rating.rating);
    if (!organization || !value) return [];
    return [
      {
        kind: "age-rating",
        label: organization,
        value,
        source: "igdb",
        confidence: 0.86,
        priority: organization === "PEGI" ? 100 : 60,
      },
    ];
  });

  const pegi = parsedFacts.find((fact) => fact.label === "PEGI");
  if (pegi) return [pegi];

  const esrb = parsedFacts.find((fact) => fact.label === "ESRB");
  if (esrb) return [esrb];

  return [];
}

function buildRatingFacts(game: IGDBGame): MetadataFact[] {
  const rating =
    game.aggregated_rating || game.total_rating || game.rating || undefined;
  const value = formatRatingValue(rating);
  if (!value) return [];

  return [
    {
      kind: "rating",
      label: "IGDB",
      value,
      source: "igdb",
      confidence: game.aggregated_rating ? 0.82 : 0.72,
      priority: game.aggregated_rating ? 84 : 74,
    },
  ];
}

function buildTimeToBeatFacts(
  timeToBeat: IGDBTimeToBeat | null,
): MetadataFact[] {
  if (!timeToBeat) return [];
  const facts: MetadataFact[] = [];
  const hastily = formatHoursFromSeconds(timeToBeat.hastily);
  const normally = formatHoursFromSeconds(timeToBeat.normally);
  const completely = formatHoursFromSeconds(timeToBeat.completely);

  if (hastily) {
    facts.push({
      kind: "time-to-beat",
      label: "Histoire",
      value: hastily,
      source: "How Long to Beat",
      confidence: 0.74,
      priority: 80,
    });
  }
  if (normally) {
    facts.push({
      kind: "time-to-beat",
      label: "Histoire + extras",
      value: normally,
      source: "How Long to Beat",
      confidence: 0.74,
      priority: 78,
    });
  }
  if (!hastily && !normally && completely) {
    facts.push({
      kind: "time-to-beat",
      label: "Durée",
      value: completely,
      source: "How Long to Beat",
      confidence: 0.68,
      priority: 77,
    });
  }
  if (completely) {
    facts.push({
      kind: "time-to-beat",
      label: "Complétion",
      value: completely,
      source: "How Long to Beat",
      confidence: 0.74,
      priority: 76,
    });
  }

  return facts;
}

function parseIGDBGame(
  game: IGDBGame,
  timeToBeat: IGDBTimeToBeat | null,
): IGDBGameResult {
  const attachments: MetadataAttachment[] = [];

  // Cover (box art)
  if (game.cover?.image_id) {
    attachments.push({
      type: "cover",
      url: igdbImageUrl(game.cover.image_id, "cover_big"),
      source: "igdb",
    });
  }

  // Screenshots (up to 8)
  (game.screenshots || []).slice(0, 8).forEach((s) => {
    attachments.push({
      type: "screenshot",
      url: igdbImageUrl(s.image_id, "screenshot_big"),
      source: "igdb",
    });
  });

  // Artworks (up to 4)
  (game.artworks || []).slice(0, 4).forEach((a) => {
    attachments.push({
      type: "artwork",
      url: igdbImageUrl(a.image_id, "1080p"),
      source: "igdb",
    });
  });

  // Release date (Unix → YYYY-MM-DD)
  let releaseDate: string | undefined;
  if (game.first_release_date) {
    releaseDate = new Date(game.first_release_date * 1000)
      .toISOString()
      .split("T")[0];
  }

  // Publishers
  const publishers = (game.involved_companies || [])
    .filter((ic) => ic.publisher)
    .map((ic) => ({ name: ic.company.name }));

  const aliases = game.alternative_names
    ? Array.from(new Set(game.alternative_names.map((an) => an.name))).filter(
        (n) => n.toLowerCase().trim() !== game.name.toLowerCase().trim(),
      )
    : undefined;

  return {
    title: game.name,
    description: game.summary,
    releaseDate,
    publishers: publishers.length > 0 ? publishers : undefined,
    attachments,
    aliases,
    facts: [
      ...buildAgeRatingFacts(game),
      ...buildRatingFacts(game),
      ...buildTimeToBeatFacts(timeToBeat),
    ],
    externalIds: { igdb: String(game.id) },
  };
}
