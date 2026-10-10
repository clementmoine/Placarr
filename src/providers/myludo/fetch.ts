import { httpGet } from "@/lib/http/httpClient";

import { normalizeProductBarcode } from "@/core/identify/normalize";

import {
  myLudoSearchEvidenceUrl,
  promoteMyLudoSearchEvidence,
  readMyLudoSearchEvidence,
} from "./durableEvidence";

const BASE_URL = "https://www.myludo.fr";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "fr-FR,fr;q=0.9",
  Referer: `${BASE_URL}/`,
};

type MyLudoSession = {
  cookie: string;
  csrfToken: string;
};

type MyLudoSearchRow = {
  id?: string;
  code?: string;
  title?: string;
};

type MyLudoGamePayload = {
  id?: string;
  code?: string;
  title?: string;
  edition?: number;
  image?: { S300?: string; S160?: string };
  age?: string;
  players?: string;
  time_min?: string;
  time_max?: string;
  duration?: number;
  meta?: { description?: string; image?: string };
  images?: Array<{
    published?: boolean;
    image?: { jpg360?: string; jpg?: string };
  }>;
};

export interface MyLudoSearchHit {
  url: string;
  gameId: string;
  title?: string;
}

export interface MyLudoGame {
  title?: string;
  description?: string;
  /** Official box art served under `/img/jeux/`. */
  imageUrl?: string;
  /** Community uploads served under `/img/medias/` — not box covers. */
  mediaImages?: string[];
  players?: string;
  playtime?: string;
  ageRating?: string;
  year?: string;
  productUrl: string;
  listingTitles?: string[];
}

function isMyLudoOfficialCoverUrl(url: string): boolean {
  return /\/img\/jeux\//i.test(url);
}

function isMyLudoCommunityMediaUrl(url: string): boolean {
  return /\/img\/medias\//i.test(url);
}

let sessionPromise: Promise<MyLudoSession> | null = null;

function parseCsrfToken(html: string): string | undefined {
  const match = html.match(
    /<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i,
  );
  return match?.[1]?.trim();
}

function parseSessionCookie(setCookie: string | string[] | undefined): string {
  const headers = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  for (const header of headers) {
    const match = header.match(/MYLUDO_SESSID=([^;]+)/i);
    if (match) return `MYLUDO_SESSID=${match[1]}`;
  }
  return "";
}

async function bootstrapMyLudoSession(): Promise<MyLudoSession> {
  const response = await httpGet(`${BASE_URL}/`, {
    headers: {
      ...HEADERS,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeout: 10_000,
  });

  const csrfToken = parseCsrfToken(response.data as string);
  const cookie = parseSessionCookie(response.headers["set-cookie"]);
  if (!csrfToken || !cookie) {
    throw new Error("MyLudo session bootstrap failed");
  }

  return { cookie, csrfToken };
}

async function getMyLudoSession(): Promise<MyLudoSession> {
  if (!sessionPromise) {
    sessionPromise = bootstrapMyLudoSession().catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

function myLudoProductUrl(game: { id?: string; code?: string }): string {
  const id = game.id?.trim();
  const code = game.code?.trim();
  if (!id) return `${BASE_URL}/`;
  if (code) return `${BASE_URL}/#!/game/${code}-${id}`;
  return `${BASE_URL}/#!/game/${id}`;
}

function formatPlaytime(payload: MyLudoGamePayload): string | undefined {
  const min = payload.time_min?.trim();
  const max = payload.time_max?.trim();
  if (min && max && min !== max) return `${min} — ${max} min`;
  if (min) return `${min} min`;
  if (payload.duration != null && Number.isFinite(payload.duration)) {
    return `${payload.duration} min`;
  }
  return undefined;
}

export function mapMyLudoGamePayload(payload: MyLudoGamePayload): MyLudoGame {
  const mediaImages: string[] = [];
  const seen = new Set<string>();
  const galleryEntries = Array.isArray(payload.images) ? payload.images : [];

  for (const entry of galleryEntries) {
    if (entry.published === false) continue;
    const url = entry.image?.jpg360 || entry.image?.jpg;
    if (!url || !isMyLudoCommunityMediaUrl(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    mediaImages.push(url);
  }

  const coverFromImage =
    payload.image?.S300 || payload.image?.S160 || undefined;
  const coverFromMeta =
    payload.meta?.image && isMyLudoOfficialCoverUrl(payload.meta.image)
      ? payload.meta.image
      : undefined;
  const imageUrl =
    (coverFromImage && isMyLudoOfficialCoverUrl(coverFromImage)
      ? coverFromImage
      : undefined) || coverFromMeta;

  const title = payload.title?.replace(/\.{3,}\s*$/, "").trim() || undefined;

  return {
    title,
    description: payload.meta?.description,
    imageUrl,
    mediaImages: mediaImages.length > 0 ? mediaImages : undefined,
    players: payload.players?.trim() || undefined,
    playtime: formatPlaytime(payload),
    ageRating: payload.age?.trim() || undefined,
    year:
      payload.edition != null && Number.isFinite(payload.edition)
        ? String(payload.edition)
        : undefined,
    productUrl: myLudoProductUrl(payload),
    listingTitles: title ? [title] : undefined,
  };
}

export function parseMyLudoSearchList(
  data: unknown,
  limit = 8,
): MyLudoSearchHit[] {
  if (!data || typeof data !== "object") return [];
  const list = (data as { list?: MyLudoSearchRow[] }).list;
  if (!Array.isArray(list)) return [];

  const hits: MyLudoSearchHit[] = [];
  for (const row of list) {
    const gameId = row.id?.trim();
    if (!gameId) continue;
    hits.push({
      gameId,
      url: myLudoProductUrl(row),
      title: row.title?.replace(/\.{3,}\s*$/, "").trim() || undefined,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

async function fetchMyLudoApi<T>(
  path: string,
  params: Record<string, string>,
): Promise<T | null> {
  try {
    const session = await getMyLudoSession();
    const response = await httpGet(`${BASE_URL}${path}`, {
      params,
      headers: {
        ...HEADERS,
        Cookie: session.cookie,
        "X-CSRF-Token": session.csrfToken,
      },
      timeout: 10_000,
    });
    return response.data as T;
  } catch (error) {
    console.error("[MyLudo] API request failed:", error);
    sessionPromise = null;
    return null;
  }
}

export async function searchMyLudoHits(
  query: string,
  barcode?: string | null,
  limit = 8,
): Promise<MyLudoSearchHit[]> {
  const normalizedBarcode = normalizeProductBarcode(barcode);
  if (normalizedBarcode) {
    const searchUrl = myLudoSearchEvidenceUrl({
      type: "barcode",
      code: normalizedBarcode,
    });
    const fromEvidence = await readMyLudoSearchEvidence(searchUrl);
    if (fromEvidence) {
      console.info(`[MyLudo] Search evidence hit for ${searchUrl}`);
      return fromEvidence.slice(0, limit);
    }
    const data = await fetchMyLudoApi<{ list?: MyLudoSearchRow[] }>(
      "/views/search/datas.php",
      { type: "barcode", code: normalizedBarcode },
    );
    const hits = parseMyLudoSearchList(data, limit);
    await promoteMyLudoSearchEvidence(searchUrl, hits);
    return hits;
  }

  const cleanedQuery = query.trim();
  if (!cleanedQuery) return [];

  const searchUrl = myLudoSearchEvidenceUrl({
    type: "search",
    words: cleanedQuery,
  });
  const fromEvidence = await readMyLudoSearchEvidence(searchUrl);
  if (fromEvidence) {
    console.info(`[MyLudo] Search evidence hit for ${searchUrl}`);
    return fromEvidence.slice(0, limit);
  }

  const data = await fetchMyLudoApi<{ list?: MyLudoSearchRow[] }>(
    "/views/search/datas.php",
    { type: "search", words: cleanedQuery },
  );
  const hits = parseMyLudoSearchList(data, limit);
  await promoteMyLudoSearchEvidence(searchUrl, hits);
  return hits;
}

export async function fetchMyLudoGameById(gameId: string): Promise<MyLudoGame> {
  const data = await fetchMyLudoApi<MyLudoGamePayload>(
    "/views/game/datas.php",
    { type: "game", id: gameId },
  );
  if (!data || typeof data !== "object" || !data.id) {
    throw new Error(`MyLudo game ${gameId} not found`);
  }
  return mapMyLudoGamePayload(data);
}

export async function fetchMyLudoGame(url: string): Promise<MyLudoGame> {
  const hashMatch = url.match(/\/game\/(?:[^/]+-)?(\d+)\b/i);
  const idMatch = url.match(/[?&]id=(\d+)/i);
  const gameId = hashMatch?.[1] || idMatch?.[1];
  if (!gameId) {
    throw new Error(`MyLudo URL has no game id: ${url}`);
  }
  return fetchMyLudoGameById(gameId);
}

export type MyLudoBarcodeHit = {
  title: string;
  imageUrl?: string | null;
  players?: string | null;
  playtime?: string | null;
};

export async function fetchMyLudoBarcodeProduct(
  barcode: string,
): Promise<MyLudoBarcodeHit | null> {
  const normalizedBarcode = normalizeProductBarcode(barcode);
  if (!normalizedBarcode) return null;

  try {
    const hits = await searchMyLudoHits("", normalizedBarcode, 1);
    const hit = hits[0];
    if (!hit) return null;

    const game = await fetchMyLudoGameById(hit.gameId);
    if (!game.title) return null;

    return {
      title: game.title,
      imageUrl: game.imageUrl || null,
      players: game.players ?? null,
      playtime: game.playtime ?? null,
    };
  } catch (error) {
    console.error("[MyLudo] Barcode lookup failed:", error);
    return null;
  }
}

export function resetMyLudoSessionForTests(): void {
  sessionPromise = null;
}
