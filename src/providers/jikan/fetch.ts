/**
 * Jikan v4 — proxy public non officiel de MyAnimeList.
 * Manga série (pas de volumes FR / ISBN). Rate-limit MAL ~3 req/s : la couche
 * `httpGet` (host limiter + retry) suffit ; pas de Flare.
 *
 * @see https://docs.jikan.moe/
 */
import { httpGet } from "@/lib/http/httpClient";
import { isAbortError, throwIfAborted } from "@/lib/http/abort";
import { collectObjectMappingSignals } from "@/lib/dev/scrapeMappingSignals";

const JIKAN_BASE = "https://api.jikan.moe/v4";

export type JikanManga = {
  malId: number;
  title: string;
  sourceUrl: string;
  titleEnglish?: string;
  titleJapanese?: string;
  titleSynonyms: string[];
  type?: string;
  status?: string;
  volumes?: number;
  chapters?: number;
  score?: number;
  scoredBy?: number;
  synopsis?: string;
  imageUrl?: string;
  authors: string[];
  genres: string[];
  demographics: string[];
  publishedFrom?: string;
  publishedString?: string;
};

type JikanRawManga = {
  mal_id?: number;
  url?: string;
  title?: string;
  title_english?: string | null;
  title_japanese?: string | null;
  title_synonyms?: string[];
  type?: string | null;
  status?: string | null;
  volumes?: number | null;
  chapters?: number | null;
  score?: number | null;
  scored_by?: number | null;
  synopsis?: string | null;
  images?: {
    jpg?: { large_image_url?: string; image_url?: string };
    webp?: { large_image_url?: string; image_url?: string };
  };
  authors?: Array<{ name?: string }>;
  genres?: Array<{ name?: string }>;
  themes?: Array<{ name?: string }>;
  demographics?: Array<{ name?: string }>;
  published?: {
    from?: string | null;
    string?: string | null;
  };
};

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function yearFromIso(value?: string | null): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})/.exec(value.trim());
  return match?.[1];
}

/** @internal exported for unit tests */
export function mapJikanRawManga(raw: JikanRawManga | null): JikanManga | null {
  if (!raw?.mal_id || !raw.title?.trim()) return null;
  const imageUrl =
    raw.images?.jpg?.large_image_url ||
    raw.images?.webp?.large_image_url ||
    raw.images?.jpg?.image_url ||
    raw.images?.webp?.image_url ||
    undefined;
  const genres = [...(raw.genres ?? []), ...(raw.themes ?? [])]
    .map((entry) => cleanText(entry.name))
    .filter((name): name is string => Boolean(name));
  return {
    malId: raw.mal_id,
    title: raw.title.trim(),
    sourceUrl: raw.url?.trim() || `https://myanimelist.net/manga/${raw.mal_id}`,
    titleEnglish: cleanText(raw.title_english) || undefined,
    titleJapanese: cleanText(raw.title_japanese) || undefined,
    titleSynonyms: (raw.title_synonyms ?? [])
      .map((name) => cleanText(name))
      .filter((name): name is string => Boolean(name)),
    type: cleanText(raw.type) || undefined,
    status: cleanText(raw.status) || undefined,
    volumes: raw.volumes ?? undefined,
    chapters: raw.chapters ?? undefined,
    score: raw.score ?? undefined,
    scoredBy: raw.scored_by ?? undefined,
    synopsis: cleanText(raw.synopsis) || undefined,
    imageUrl: imageUrl || undefined,
    authors: (raw.authors ?? [])
      .map((entry) => cleanText(entry.name)?.replace(/,\s*/g, " "))
      .filter((name): name is string => Boolean(name)),
    genres: Array.from(new Set(genres)),
    demographics: (raw.demographics ?? [])
      .map((entry) => cleanText(entry.name))
      .filter((name): name is string => Boolean(name)),
    publishedFrom: yearFromIso(raw.published?.from),
    publishedString: cleanText(raw.published?.string) || undefined,
  };
}

async function jikanGetJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T | null> {
  throwIfAborted(signal);
  try {
    const response = await httpGet(`${JIKAN_BASE}${path}`, {
      signal,
      timeout: 20_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "Placarr/1.0 (personal collection; +https://github.com)",
      },
    });
    return response.data as T;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export async function fetchJikanMangaById(
  malId: number | string,
  signal?: AbortSignal,
): Promise<JikanManga | null> {
  const id = String(malId).trim();
  if (!/^\d+$/.test(id)) return null;
  const payload = await jikanGetJson<{ data?: JikanRawManga }>(
    `/manga/${id}/full`,
    signal,
  );
  return mapJikanRawManga(payload?.data ?? null);
}

export async function searchJikanManga(
  query: string,
  signal?: AbortSignal,
): Promise<JikanManga[]> {
  const q = query.trim();
  if (!q) return [];
  const payload = await jikanGetJson<{ data?: JikanRawManga[] }>(
    `/manga?q=${encodeURIComponent(q)}&limit=8&sfw=true`,
    signal,
  );
  return (payload?.data ?? [])
    .map((entry) => mapJikanRawManga(entry))
    .filter((entry): entry is JikanManga => Boolean(entry));
}

export async function resolveJikanManga(input: {
  name?: string;
  malId?: string | number | null;
  lookupQueries?: string[];
  signal?: AbortSignal;
}): Promise<JikanManga | null> {
  throwIfAborted(input.signal);
  if (input.malId != null && String(input.malId).trim()) {
    const byId = await fetchJikanMangaById(input.malId, input.signal);
    if (byId) return byId;
  }
  const queries = Array.from(
    new Set(
      [...(input.lookupQueries ?? []), input.name ?? ""]
        .map((q) => q.trim())
        .filter(Boolean),
    ),
  );
  for (const query of queries) {
    const hits = await searchJikanManga(query, input.signal);
    if (hits[0]) return hits[0];
  }
  return null;
}

export async function collectJikanMappingRawKeys(
  query: string,
): Promise<string[]> {
  const hits = await searchJikanManga(query);
  return collectObjectMappingSignals(hits[0] ?? { query });
}
