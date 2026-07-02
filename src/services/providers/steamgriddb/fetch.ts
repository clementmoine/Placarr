import axios from "axios";
import { isMetadataTitleAligned } from "@/lib/metadata/titleMatching";
import type {
  MetadataAttachment,
  MetadataResult,
} from "@/types/metadataProvider";

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

function pickBestGame(
  games: SteamGridDbGame[],
  requestedName: string,
): SteamGridDbGame | null {
  if (games.length === 0) return null;

  const aligned = games.filter(
    (game) =>
      game.name &&
      isMetadataTitleAligned({ title: game.name }, [requestedName], 0.58),
  );
  if (aligned.length === 0) return null;

  return [...aligned].sort(
    (a, b) => Number(Boolean(b.verified)) - Number(Boolean(a.verified)),
  )[0];
}

function assetUrl(asset: SteamGridDbAsset): string | null {
  return asset.url || asset.thumb || null;
}

function gridRoleForStyle(style?: string | null, isVertical = true): string {
  const normalized = (style || "").toLowerCase();
  if (normalized === "material") {
    return isVertical ? "3d-grid-vertical" : "3d-grid-horizontal";
  }
  return isVertical ? "grid-vertical" : "grid-horizontal";
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
        role: gridRoleForStyle(grid.style, isVertical),
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
    await fetchSteamGridDbJson<SteamGridDbGame[]>("/search/autocomplete/Hades");
    return { ok: true, latency: Date.now() - start, error: null };
  } catch (error) {
    return {
      ok: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "SteamGridDB unreachable",
    };
  }
}
