import levenshtein from "fast-levenshtein";
import type {
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

interface HLTBInitResponse {
  token?: string;
  hpKey?: string;
  hpVal?: string;
}

interface HLTBSearchGame {
  game_id: number;
  game_name: string;
  game_alias?: string;
  game_type?: string;
  game_image?: string;
  comp_main?: number;
  comp_plus?: number;
  comp_100?: number;
  comp_all?: number;
  review_score?: number;
  profile_platform?: string;
  release_world?: number;
}

interface HLTBSearchResponse {
  data?: HLTBSearchGame[];
}

interface HLTBPlatformData {
  platform?: string;
  count_comp?: number;
  count_total?: number;
  comp_main?: number;
  comp_plus?: number;
  comp_100?: number;
  comp_all?: number;
  comp_low?: number;
  comp_high?: number;
}

interface HLTBDetailData {
  game?: HLTBSearchGame[];
  platformData?: HLTBPlatformData[];
}

const HLTB_REQUEST_TIMEOUT_MS = 12_000;
const MIN_HLTB_SCORE = 0.52;
const HLTB_BASE_URL = "https://howlongtobeat.com";
const HLTB_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function normalizeForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a: string, b?: string | null): number {
  if (!b) return 0;
  const normA = normalizeForComparison(a);
  const normB = normalizeForComparison(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  if (normA.includes(normB) || normB.includes(normA)) return 0.9;

  const dist = levenshtein.get(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  return maxLen > 0 ? 1 - dist / maxLen : 0;
}

function hasUsableTime(entry: HLTBSearchGame): boolean {
  return [
    entry.comp_main,
    entry.comp_plus,
    entry.comp_100,
    entry.comp_all,
  ].some((value) => typeof value === "number" && value > 0);
}

function scoreEntry(query: string, entry: HLTBSearchGame): number {
  const nameScore = Math.max(
    titleSimilarity(query, entry.game_name),
    titleSimilarity(query, entry.game_alias),
  );

  let score = nameScore;
  if (entry.game_type && entry.game_type !== "game") score -= 0.18;
  if (!hasUsableTime(entry)) score -= 0.2;
  return score;
}

function pickBestResult(
  query: string,
  results: HLTBSearchGame[],
): HLTBSearchGame | null {
  const ranked = results
    .filter((entry) => entry.game_name)
    .map((entry) => ({
      entry,
      score: scoreEntry(query, entry),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < MIN_HLTB_SCORE || !hasUsableTime(best.entry)) {
    return null;
  }

  return best.entry;
}

function formatSecondsAsHours(value?: number | null): string | null {
  if (!value || value <= 0) return null;
  const totalMinutes = Math.floor(value / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  return minutes
    ? `${hours} h ${String(minutes).padStart(2, "0")}`
    : `${hours} h`;
}

function formatReviewScore(value?: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const max = value <= 5 ? 5 : value <= 10 ? 10 : 100;
  const score = Math.min(value, max);

  return `${score.toLocaleString("fr-FR", {
    maximumFractionDigits: max <= 10 ? 1 : 0,
  })}/${max}`;
}

function buildTimeToBeatFacts(
  query: string,
  entry: HLTBSearchGame,
  platformData?: HLTBPlatformData | null,
): MetadataFact[] {
  const facts: MetadataFact[] = [];
  const confidence = Math.max(0.5, scoreEntry(query, entry));
  const hltbLink =
    entry.game_id > 0 ? `${HLTB_BASE_URL}/game/${entry.game_id}` : undefined;
  const source = platformData?.platform
    ? `How Long to Beat · ${platformData.platform}`
    : "How Long to Beat";
  const main = platformData?.comp_main || entry.comp_main || null;
  const mainSource = platformData?.comp_main ? source : "How Long to Beat";
  const completion = platformData?.comp_100 || entry.comp_100 || null;
  const completionSource = platformData?.comp_100 ? source : "How Long to Beat";
  const fallback =
    platformData?.comp_all ||
    platformData?.comp_plus ||
    entry.comp_all ||
    entry.comp_plus ||
    null;
  const fallbackSource =
    platformData?.comp_all || platformData?.comp_plus
      ? source
      : "How Long to Beat";
  const pushTime = (
    kind: string,
    label: string,
    value: number | null,
    priority: number,
    factSource = source,
  ) => {
    const formatted = formatSecondsAsHours(value);
    if (!formatted) return false;
    facts.push({
      kind,
      label,
      value: formatted,
      url: hltbLink,
      source: factSource,
      confidence,
      priority,
    });
    return true;
  };

  const hasMainDuration = pushTime("duration", "Durée", main, 86, mainSource);
  pushTime("completion-time", "Complétion", completion, 82, completionSource);

  if (!hasMainDuration) {
    pushTime(
      "duration",
      "Durée",
      fallback || completion,
      80,
      fallback ? fallbackSource : completionSource,
    );
  }

  const reviewScore = formatReviewScore(entry.review_score);
  if (reviewScore) {
    facts.push({
      kind: "rating",
      label: "How Long to Beat",
      value: reviewScore,
      url: hltbLink,
      source: "How Long to Beat",
      confidence: Math.min(confidence, 0.72),
      priority: 73,
    });
  }

  return facts;
}

function buildHowLongToBeatImageUrl(gameImage?: string | null): string | null {
  const value = String(gameImage || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${HLTB_BASE_URL}/games/${value.replace(/^\/+/, "")}`;
}

function normalizePlatformForHLTB(platform?: string | null): string {
  if (!platform) return "";
  const normalized = normalizeForComparison(platform);
  const platformMap: Record<string, string> = {
    "nintendo wii": "Wii",
    wii: "Wii",
    "wii u": "Wii U",
    "nintendo ds": "Nintendo DS",
    ds: "Nintendo DS",
    "nintendo 3ds": "Nintendo 3DS",
    "nintendo switch": "Nintendo Switch",
    "xbox original": "Xbox",
    xbox: "Xbox",
    "xbox 360": "Xbox 360",
    "xbox one": "Xbox One",
    "xbox series": "Xbox Series X/S",
    "playstation 2": "PlayStation 2",
    ps2: "PlayStation 2",
    "playstation 3": "PlayStation 3",
    ps3: "PlayStation 3",
    "playstation 4": "PlayStation 4",
    ps4: "PlayStation 4",
    "playstation 5": "PlayStation 5",
    ps5: "PlayStation 5",
    psp: "PlayStation Portable",
    "playstation portable": "PlayStation Portable",
    pc: "PC",
  };
  return platformMap[normalized] || "";
}

function tokenizeHLTBQuery(query: string): string[] {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function buildSearchPayload(
  query: string,
  platform: string,
  init: HLTBInitResponse,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    searchType: "games",
    searchTerms: tokenizeHLTBQuery(query),
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0,
        platform,
        sortCategory: "popular",
        rangeCategory: "main",
        rangeTime: {
          min: 0,
          max: 0,
        },
        gameplay: {
          perspective: "",
          flow: "",
          genre: "",
          difficulty: "",
        },
        rangeYear: {
          min: "",
          max: "",
        },
        modifier: "hide_dlc",
      },
      users: {
        sortCategory: "postcount",
      },
      lists: {
        sortCategory: "follows",
      },
      filter: "",
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };

  if (init.hpKey && init.hpVal) {
    payload[init.hpKey] = init.hpVal;
  }

  return payload;
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HLTB_REQUEST_TIMEOUT_MS);
  try {
    return await fetchJson<T>(url, init, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextWithTimeout(
  url: string,
  init: RequestInit,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HLTB_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function searchHowLongToBeat(
  query: string,
  platform?: string | null,
): Promise<HLTBSearchGame[]> {
  const baseHeaders = {
    "User-Agent": HLTB_USER_AGENT,
    Accept: "application/json",
    Referer: `${HLTB_BASE_URL}/`,
  };

  const init = await fetchJsonWithTimeout<HLTBInitResponse>(
    `${HLTB_BASE_URL}/api/bleed/init?t=${Date.now()}`,
    {
      headers: baseHeaders,
    },
  );
  if (!init.token) return [];

  const response = await fetchJsonWithTimeout<HLTBSearchResponse>(
    `${HLTB_BASE_URL}/api/bleed`,
    {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "application/json",
        "x-auth-token": init.token,
        "x-hp-key": init.hpKey || "",
        "x-hp-val": init.hpVal || "",
      },
      body: JSON.stringify(
        buildSearchPayload(query, normalizePlatformForHLTB(platform), init),
      ),
    },
  );

  return response.data || [];
}

function extractDetailData(html: string): HLTBDetailData | null {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match?.[1]) return null;

  try {
    const nextData = JSON.parse(match[1]);
    return nextData?.props?.pageProps?.game?.data || null;
  } catch {
    return null;
  }
}

async function fetchHowLongToBeatDetail(
  gameId: number,
): Promise<HLTBDetailData | null> {
  const html = await fetchTextWithTimeout(`${HLTB_BASE_URL}/game/${gameId}`, {
    headers: {
      "User-Agent": HLTB_USER_AGENT,
      Accept: "text/html",
      Referer: `${HLTB_BASE_URL}/`,
    },
  });
  if (!html) return null;
  return extractDetailData(html);
}

function pickPlatformData(
  detail: HLTBDetailData | null,
  platform?: string | null,
): HLTBPlatformData | null {
  const normalizedPlatform = normalizePlatformForHLTB(platform);
  if (!normalizedPlatform || !detail?.platformData?.length) return null;
  const normalizedTarget = normalizeForComparison(normalizedPlatform);

  return (
    detail.platformData.find(
      (entry) =>
        normalizeForComparison(entry.platform || "") === normalizedTarget,
    ) || null
  );
}

export async function fetchFromHowLongToBeat(
  name: string,
  platform?: string | null,
): Promise<MetadataResult | null> {
  const query = name.trim();
  if (!query) return null;

  try {
    let results = await searchHowLongToBeat(query, platform);
    if (results.length === 0 && normalizePlatformForHLTB(platform)) {
      results = await searchHowLongToBeat(query, null);
    }
    if (results.length === 0) return null;

    const best = pickBestResult(query, results);
    if (!best) return null;

    let detail: HLTBDetailData | null = null;
    if (best.game_id > 0) {
      try {
        detail = await fetchHowLongToBeatDetail(best.game_id);
      } catch {
        // Detail page is optional — search results already carry playtime data.
      }
    }
    const platformData = pickPlatformData(detail, platform);
    const detailGame = detail?.game?.[0];
    const facts = buildTimeToBeatFacts(
      query,
      detailGame ? { ...best, ...detailGame } : best,
      platformData,
    );
    if (facts.length === 0) return null;

    const aliases = [best.game_alias]
      .filter((alias): alias is string => Boolean(alias))
      .filter(
        (alias) =>
          alias.toLowerCase().trim() !== best.game_name.toLowerCase().trim(),
      );

    const coverUrl = buildHowLongToBeatImageUrl(best.game_image);

    return {
      title: best.game_name || undefined,
      attachments: coverUrl
        ? [{ type: "image", url: coverUrl, source: "howlongtobeat" }]
        : undefined,
      aliases: aliases.length > 0 ? aliases : undefined,
      facts,
    };
  } catch (err) {
    const isAbort =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && /aborted/i.test(err.message));
    if (isAbort) {
      console.warn(`[HowLongToBeat] Timeout fetching "${name}"`);
      return null;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[HowLongToBeat] Error fetching "${name}":`, message);
    return null;
  }
}
