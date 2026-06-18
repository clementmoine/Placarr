import axios from "axios";
import levenshtein from "fast-levenshtein";
import type { MetadataAttachment, MetadataResult } from "./metadata";

const STEAMGRIDDB_API_BASE = "https://www.steamgriddb.com/api/v2";
const REQUEST_TIMEOUT_MS = 8000;

interface SteamGridDbResponse<T> {
  success?: boolean;
  data?: T;
  errors?: string[];
}

interface SteamGridDbGame {
  id: number;
  name?: string | null;
  types?: string[] | null;
  verified?: boolean | null;
}

interface SteamGridDbAsset {
  height?: number | null;
  id?: number | null;
  style?: string | null;
  thumb?: string | null;
  url?: string | null;
  width?: number | null;
}

function getSteamGridDbApiKey() {
  return (
    process.env.STEAMGRIDDB_API_KEY?.trim() ||
    process.env.STEAM_GRID_DB_API_KEY?.trim() ||
    ""
  );
}

async function fetchSteamGridDbJson<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T | null> {
  const apiKey = getSteamGridDbApiKey();
  if (!apiKey) return null;

  const res = await axios.get<SteamGridDbResponse<T>>(
    `${STEAMGRIDDB_API_BASE}${path}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      params,
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 300,
    },
  );

  return res.data?.data ?? null;
}

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

function titleSimilarity(a: string, b: string): number {
  const normalizedA = normalizeForComparison(a);
  const normalizedB = normalizeForComparison(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return 0.9;
  }

  const aTokens = new Set(normalizedA.split(/\s+/));
  const bTokens = new Set(normalizedB.split(/\s+/));
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  const tokenScore = shared / Math.max(aTokens.size, bTokens.size);
  const distanceScore =
    1 -
    levenshtein.get(normalizedA, normalizedB) /
      Math.max(normalizedA.length, normalizedB.length);

  return Math.max(tokenScore, distanceScore);
}

function pickBestGame(
  games: SteamGridDbGame[],
  requestedName: string,
): SteamGridDbGame | null {
  if (games.length === 0) return null;

  const best = [...games].sort((a, b) => {
    const scoreA = titleSimilarity(a.name || "", requestedName);
    const scoreB = titleSimilarity(b.name || "", requestedName);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return Number(Boolean(b.verified)) - Number(Boolean(a.verified));
  })[0];

  if (!best?.name || titleSimilarity(best.name, requestedName) < 0.56) {
    return null;
  }
  return best;
}

function assetUrl(asset: SteamGridDbAsset): string | null {
  return asset.url || asset.thumb || null;
}

function buildGridAttachments(grids?: SteamGridDbAsset[] | null) {
  if (!grids) return [];

  return grids.slice(0, 10).flatMap((grid) => {
    const url = assetUrl(grid);
    if (!url) return [];

    const isVertical =
      typeof grid.width === "number" &&
      typeof grid.height === "number" &&
      grid.height > grid.width;

    return [
      {
        type: isVertical ? "cover" : "artwork",
        title: grid.style ? `SteamGridDB - ${grid.style}` : "SteamGridDB",
        url,
        role: isVertical ? "grid-vertical" : "grid-horizontal",
        source: "steamgriddb",
      } satisfies MetadataAttachment,
    ];
  });
}

function buildBackgroundAttachments(heroes?: SteamGridDbAsset[] | null) {
  if (!heroes) return [];

  return heroes.slice(0, 4).flatMap((hero) => {
    const url = assetUrl(hero);
    if (!url) return [];
    return [
      {
        type: "background",
        title: hero.style ? `SteamGridDB - ${hero.style}` : "SteamGridDB Hero",
        url,
        source: "steamgriddb",
      } satisfies MetadataAttachment,
    ];
  });
}

function buildLogoAttachments(logos?: SteamGridDbAsset[] | null) {
  if (!logos) return [];

  return logos.slice(0, 4).flatMap((logo) => {
    const url = assetUrl(logo);
    if (!url) return [];
    return [
      {
        type: "logo",
        title: logo.style ? `SteamGridDB - ${logo.style}` : "SteamGridDB Logo",
        url,
        source: "steamgriddb",
      } satisfies MetadataAttachment,
    ];
  });
}

export async function fetchFromSteamGridDB(
  name: string,
): Promise<MetadataResult | null> {
  if (!getSteamGridDbApiKey()) return null;

  try {
    const games = await fetchSteamGridDbJson<SteamGridDbGame[]>(
      `/search/autocomplete/${encodeURIComponent(name)}`,
    );
    const game = pickBestGame(games || [], name);
    if (!game?.id) return null;

    const [gridsResult, heroesResult, logosResult] = await Promise.allSettled([
      fetchSteamGridDbJson<SteamGridDbAsset[]>(`/grids/game/${game.id}`, {
        dimensions: "600x900,342x482,660x930,920x430",
        nsfw: false,
        humor: false,
        limit: 10,
      }),
      fetchSteamGridDbJson<SteamGridDbAsset[]>(`/heroes/game/${game.id}`, {
        nsfw: false,
        humor: false,
        limit: 4,
      }),
      fetchSteamGridDbJson<SteamGridDbAsset[]>(`/logos/game/${game.id}`, {
        nsfw: false,
        humor: false,
        limit: 4,
      }),
    ]);

    const grids = gridsResult.status === "fulfilled" ? gridsResult.value : null;
    const heroes =
      heroesResult.status === "fulfilled" ? heroesResult.value : null;
    const logos = logosResult.status === "fulfilled" ? logosResult.value : null;
    const attachments = [
      ...buildGridAttachments(grids),
      ...buildBackgroundAttachments(heroes),
      ...buildLogoAttachments(logos),
    ];
    const cover = attachments.find((attachment) => attachment.type === "cover");
    const background = attachments.find(
      (attachment) => attachment.type === "background",
    );

    return {
      title: game.name || undefined,
      imageUrl: cover?.url || background?.url,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  } catch (error) {
    console.error(
      `[SteamGridDB] Error fetching artwork for "${name}": ${
        error instanceof Error ? error.message : error
      }`,
    );
    return null;
  }
}

export async function pingSteamGridDB() {
  const start = Date.now();
  if (!getSteamGridDbApiKey()) {
    return { ok: false, latency: null, error: "STEAMGRIDDB_API_KEY missing" };
  }

  try {
    await fetchSteamGridDbJson<SteamGridDbGame[]>(
      "/search/autocomplete/Hades",
    );
    return { ok: true, latency: Date.now() - start, error: null };
  } catch (error) {
    return {
      ok: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "SteamGridDB unreachable",
    };
  }
}
