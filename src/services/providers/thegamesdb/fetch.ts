import axios from "axios";

const API_BASE = "https://api.thegamesdb.net";

export type TheGamesDbSearchGame = {
  id: number;
  game_title: string;
  release_date?: string;
  platform?: number;
  region_id?: number;
  country_id?: number;
  developers?: number[] | null;
};

export type TheGamesDbBoxArt = {
  id: number;
  type: string;
  side?: string;
  filename: string;
  resolution?: string | null;
};

export type TheGamesDbGameDetails = TheGamesDbSearchGame & {
  overview?: string;
  players?: string;
  coop?: string;
  youtube?: string;
  os?: string;
  processor?: string;
  ram?: string;
  hdd?: string;
  video?: string;
  sound?: string;
  alternates?: string[];
};

export type TheGamesDbByGameIdResponse = {
  code: number;
  status: string;
  data?: {
    count: number;
    games: TheGamesDbGameDetails[];
  };
  include?: {
    boxart?: {
      base_url?: Partial<Record<string, string>>;
      data?: Record<string, TheGamesDbBoxArt[]>;
    };
    overview?: {
      data?: Record<string, { overview?: string }>;
    };
    genres?: {
      data?: Record<string, { id: number; name: string }>;
    };
    developers?: {
      data?: Record<string, { id: number; name: string }>;
    };
    publishers?: {
      data?: Record<string, { id: number; name: string }>;
    };
    platform?: {
      data?: Record<string, { id: number; name: string; alias?: string }>;
    };
  };
  remaining_monthly_allowance?: number;
};

export type TheGamesDbSearchResponse = {
  code: number;
  status: string;
  data?: {
    count: number;
    games: TheGamesDbSearchGame[];
  };
  remaining_monthly_allowance?: number;
};

function getApiKey(): string | null {
  const apiKey = process.env.THEGAMESDB_API_KEY?.trim();
  return apiKey || null;
}

function warnAllowance(response: { remaining_monthly_allowance?: number }) {
  const remaining = response.remaining_monthly_allowance;
  if (typeof remaining === "number" && remaining <= 50) {
    console.warn(`[TheGamesDB] Low monthly API allowance: ${remaining}`);
  }
}

export async function searchTheGamesDbByName(
  name: string,
): Promise<TheGamesDbSearchResponse | null> {
  const apiKey = getApiKey();
  if (!apiKey || !name.trim()) return null;

  try {
    const response = await axios.get<TheGamesDbSearchResponse>(
      `${API_BASE}/v1.1/Games/ByGameName`,
      {
        params: { apikey: apiKey, name: name.trim() },
        timeout: 8000,
        validateStatus: (status) => status < 500,
      },
    );
    if (response.status >= 400 || response.data.code !== 200) return null;
    warnAllowance(response.data);
    return response.data;
  } catch (error) {
    console.warn("[TheGamesDB] Search failed", error);
    return null;
  }
}

export async function fetchTheGamesDbById(
  gameId: number,
): Promise<TheGamesDbByGameIdResponse | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const response = await axios.get<TheGamesDbByGameIdResponse>(
      `${API_BASE}/v1/Games/ByGameID`,
      {
        params: {
          apikey: apiKey,
          id: gameId,
          include: "boxart,overview,genres,developers,publishers,platform",
        },
        timeout: 8000,
        validateStatus: (status) => status < 500,
      },
    );
    if (response.status >= 400 || response.data.code !== 200) return null;
    warnAllowance(response.data);
    return response.data;
  } catch (error) {
    console.warn(`[TheGamesDB] Details fetch failed for id=${gameId}`, error);
    return null;
  }
}

export async function pingTheGamesDb(): Promise<{
  ok: boolean;
  latency: number;
  error?: string;
}> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, latency: 0, error: "THEGAMESDB_API_KEY missing" };
  }

  const start = Date.now();
  try {
    const response = await axios.get(`${API_BASE}/v1/Platforms`, {
      params: { apikey: apiKey },
      timeout: 5000,
      validateStatus: () => true,
    });
    const latency = Date.now() - start;
    const ok = response.status === 200 && response.data?.code === 200;
    return {
      ok,
      latency,
      error: ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}
