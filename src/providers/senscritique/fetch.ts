import axios from "axios";

import type { MediaType } from "@/types/providerRegistry";

const GRAPHQL_URL = "https://gql.senscritique.com/graphql";
const SITE_URL = "https://www.senscritique.com";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "fr-FR,fr;q=0.9",
  Referer: `${SITE_URL}/`,
};

/**
 * SensCritique "universe" buckets per Placarr media type. The GraphQL search
 * is fuzzy — the universe filter narrows candidates, the title-alignment guard
 * does the rest.
 */
export const SENSCRITIQUE_UNIVERSES_BY_TYPE: Partial<
  Record<MediaType, string[]>
> = {
  games: ["game"],
  movies: ["movie", "tvShow"],
  musics: ["musicAlbum"],
  books: ["book", "comicBook"],
};

type ScMedia = { url?: string | null } | null;

type ScSearchProduct = {
  id?: number | null;
  title?: string | null;
  original_title?: string | null;
  universe?: string | null;
  year_of_production?: number | null;
  release_date?: string | null;
  rating?: number | null;
  url?: string | null;
  medias?: { picture?: string | null } | null;
};

type ScSearchPayload = {
  data?: {
    searchResult?: {
      total_count?: number | null;
      results?: Array<{
        universe?: string | null;
        products_list?: ScSearchProduct[] | null;
      } | null> | null;
    } | null;
  } | null;
};

type ScProductPayload = {
  data?: {
    product?: {
      id?: number | null;
      title?: string | null;
      original_title?: string | null;
      subtitle?: string | null;
      universe?: string | null;
      url?: string | null;
      release_date?: string | null;
      year_of_production?: number | null;
      duration?: string | null;
      rating?: number | null;
      synopsis?: string | null;
      genres?: Array<string | null> | null;
      artists?: Array<{ name?: string | null } | null> | null;
      stats?: {
        rating_count?: number | null;
        review_count?: number | null;
        wish_count?: number | null;
      } | null;
      medias?: {
        picture?: string | null;
        backdrop?: string | null;
      } | null;
      allPhotos?: {
        posters?: ScMedia[] | null;
        screenshots?: ScMedia[] | null;
        backdrops?: ScMedia[] | null;
      } | null;
    } | null;
  } | null;
};

export interface SensCritiqueSearchHit {
  id: number;
  title: string;
  universe?: string;
  year?: number;
  rating?: number;
  url: string;
  coverUrl?: string;
}

export interface SensCritiqueProduct {
  id: number;
  title: string;
  originalTitle?: string;
  subtitle?: string;
  universe?: string;
  productUrl: string;
  /** Localized FR release date as displayed ("1 septembre 1995"). */
  releaseDate?: string;
  releaseYear?: string;
  /** Community rating on a 0–10 scale. */
  rating?: number;
  ratingCount?: number;
  synopsis?: string;
  genres?: string[];
  artists?: string[];
  coverUrl?: string;
  backdropUrl?: string;
  posterUrls?: string[];
  screenshotUrls?: string[];
}

/**
 * media.senscritique.com URLs embed the size as a path segment
 * (`/media/{id}/{size}/{slug}`); `0` serves the original file.
 */
export function upgradeSensCritiqueImageUrl(
  url?: string | null,
): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(
    /(media\.senscritique\.com\/media\/\d+)\/\d+\//,
    "$1/0/",
  );
}

function absoluteSensCritiqueUrl(path?: string | null): string | undefined {
  const trimmed = path?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${SITE_URL}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

function collectMediaUrls(entries?: ScMedia[] | null): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries ?? []) {
    const url = upgradeSensCritiqueImageUrl(entry?.url);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
  }
  return urls;
}

export function mapSensCritiqueSearchPayload(
  data: unknown,
  limit = 8,
): SensCritiqueSearchHit[] {
  const results = (data as ScSearchPayload)?.data?.searchResult?.results;
  if (!Array.isArray(results)) return [];

  const hits: SensCritiqueSearchHit[] = [];
  for (const bucket of results) {
    for (const product of bucket?.products_list ?? []) {
      const id = product?.id;
      const title = product?.title?.trim();
      const url = absoluteSensCritiqueUrl(product?.url);
      if (!id || !title || !url) continue;
      hits.push({
        id,
        title,
        universe: product?.universe ?? undefined,
        year: product?.year_of_production ?? undefined,
        rating: product?.rating ?? undefined,
        url,
        coverUrl: upgradeSensCritiqueImageUrl(product?.medias?.picture),
      });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

export function mapSensCritiqueProductPayload(
  data: unknown,
): SensCritiqueProduct | null {
  const product = (data as ScProductPayload)?.data?.product;
  const id = product?.id;
  const title = product?.title?.trim();
  if (!id || !title) return null;

  const genres = (product.genres ?? [])
    .map((genre) => genre?.trim())
    .filter((genre): genre is string => Boolean(genre));
  const artists = (product.artists ?? [])
    .map((artist) => artist?.name?.trim())
    .filter((name): name is string => Boolean(name));
  const posterUrls = collectMediaUrls(product.allPhotos?.posters);
  const screenshotUrls = collectMediaUrls(product.allPhotos?.screenshots);
  const backdropUrl =
    upgradeSensCritiqueImageUrl(product.medias?.backdrop) ??
    collectMediaUrls(product.allPhotos?.backdrops)[0];

  return {
    id,
    title,
    originalTitle: product.original_title?.trim() || undefined,
    subtitle: product.subtitle?.trim() || undefined,
    universe: product.universe ?? undefined,
    productUrl: absoluteSensCritiqueUrl(product.url) ?? `${SITE_URL}/`,
    releaseDate: product.release_date?.trim() || undefined,
    releaseYear:
      product.year_of_production != null &&
      Number.isFinite(product.year_of_production)
        ? String(product.year_of_production)
        : undefined,
    rating:
      product.rating != null && Number.isFinite(product.rating)
        ? product.rating
        : undefined,
    ratingCount: product.stats?.rating_count ?? undefined,
    synopsis: product.synopsis?.trim() || undefined,
    genres: genres.length > 0 ? genres : undefined,
    artists: artists.length > 0 ? artists : undefined,
    coverUrl: upgradeSensCritiqueImageUrl(product.medias?.picture),
    backdropUrl,
    posterUrls: posterUrls.length > 0 ? posterUrls : undefined,
    screenshotUrls: screenshotUrls.length > 0 ? screenshotUrls : undefined,
  };
}

async function fetchSensCritiqueGraphql(
  query: string,
  signal?: AbortSignal,
): Promise<unknown | null> {
  try {
    const response = await axios.get(GRAPHQL_URL, {
      params: { query },
      headers: HEADERS,
      timeout: 10_000,
      signal,
    });
    return response.data;
  } catch (error) {
    if (!axios.isCancel(error)) {
      console.error(
        "[SensCritique] GraphQL request failed:",
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  }
}

const SEARCH_PRODUCT_FIELDS =
  "id title original_title universe year_of_production release_date rating url medias { picture }";

export async function searchSensCritique(
  keywords: string,
  options: { universe?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<SensCritiqueSearchHit[]> {
  const cleaned = keywords.trim();
  if (!cleaned) return [];

  const limit = options.limit ?? 8;
  const universeArg = options.universe
    ? `, universe: ${JSON.stringify(options.universe)}`
    : "";
  const query = `{ searchResult(keywords: ${JSON.stringify(cleaned)}${universeArg}, limit: ${limit}) { total_count results { universe products_list { ${SEARCH_PRODUCT_FIELDS} } } } }`;

  const data = await fetchSensCritiqueGraphql(query, options.signal);
  return mapSensCritiqueSearchPayload(data, limit);
}

const PRODUCT_FIELDS =
  "id title original_title subtitle universe url release_date year_of_production duration rating synopsis genres artists { name } stats { rating_count review_count wish_count } medias { picture backdrop } allPhotos { posters { url } screenshots { url } backdrops { url } }";

export async function fetchSensCritiqueProduct(
  id: number,
  signal?: AbortSignal,
): Promise<SensCritiqueProduct | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  const query = `{ product(id: ${Math.trunc(id)}) { ${PRODUCT_FIELDS} } }`;
  const data = await fetchSensCritiqueGraphql(query, signal);
  return mapSensCritiqueProductPayload(data);
}
