import { convertXML } from "simple-xml-to-json";
import { decode as decodeHTMLEntities } from "html-entities";
import axios from "axios";
import { cleanSearchQuery } from "@/services/metadataSearchUtils";
import { getMetadataProviderAdapter } from "@/services/metadataResolvers";
import { PROVIDERS } from "@/services/providerRegistry";
import { getIGDBSuggestions } from "@/services/providers/igdb";
import { parseTMDBSeriesIntent } from "@/services/providers/tmdb";
import type { BGGChild, BGGResponse } from "@/services/providers/bgg";

function normalizeSuggestionTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export async function confrontWithDatabase(
  name: string,
  type?: string | null,
): Promise<string | null> {
  if (!name || !type) return null;
  const cleanedName = cleanSearchQuery(name);
  if (!cleanedName) return null;

  // The authoritative name database for this media type declares itself via the
  // `nameDatabase` trait (e.g. IGDB/games, TMDB/movies) — no hardcoded
  // type→provider switch. Resolved by name through the provider's adapter.
  const provider = PROVIDERS.filter(
    (p) => p.types.some((t) => t === type) && p.nameDatabase,
  ).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
  if (!provider) return null;

  try {
    const adapter = getMetadataProviderAdapter(provider.id);
    const result = await adapter?.resolve({ name: cleanedName });
    return result?.title ?? null;
  } catch (e) {
    console.warn(`[ConfrontWithDatabase] Error for "${name}" (${type}):`, e);
    return null;
  }
}

async function getTMDBSuggestions(name: string): Promise<string[]> {
  try {
    const seriesIntent = parseTMDBSeriesIntent(name, cleanSearchQuery);
    const movieSearchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(name)}&api_key=${process.env.TMDB_API_KEY}&language=fr-FR`;
    const tvSearchUrl = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(seriesIntent.searchTitle)}&api_key=${process.env.TMDB_API_KEY}&language=fr-FR`;

    const [movieRes, tvRes] = await Promise.all([
      seriesIntent.isSeriesLike
        ? Promise.resolve({ data: { results: [] } })
        : axios.get(movieSearchUrl),
      axios.get(tvSearchUrl),
    ]);

    const movieSuggestions = (movieRes.data?.results || [])
      .slice(0, 5)
      .map((m: any) => m.title as string)
      .filter(Boolean);
    const tvSuggestions = (tvRes.data?.results || [])
      .slice(0, 5)
      .map((m: any) =>
        seriesIntent.seasonNumber
          ? `${m.name} - Saison ${seriesIntent.seasonNumber}`
          : (m.name as string),
      )
      .filter(Boolean);

    return Array.from(
      new Set(
        seriesIntent.isSeriesLike
          ? [...tvSuggestions, ...movieSuggestions]
          : [...movieSuggestions, ...tvSuggestions],
      ),
    ).slice(0, 5);
  } catch (e) {
    console.warn("[TMDB] Suggestions failed:", e);
    return [];
  }
}

async function getOpenLibrarySuggestions(name: string): Promise<string[]> {
  try {
    const res = await axios.get(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(name)}&limit=5`,
    );
    return (res.data?.docs || [])
      .slice(0, 5)
      .map((d: any) => d.title as string);
  } catch (e) {
    console.warn("[OpenLibrary] Suggestions failed:", e);
    return [];
  }
}

async function getDeezerSuggestions(name: string): Promise<string[]> {
  try {
    const searchUrl = `https://api.deezer.com/search/album?q=${encodeURIComponent(name)}`;
    const res = await axios.get(searchUrl);
    return (res.data?.data || []).slice(0, 5).map((album: any) => {
      const artistName = album.artist?.name || "";
      return (
        artistName ? `${artistName} - ${album.title}` : album.title
      ) as string;
    });
  } catch (e) {
    console.warn("[Deezer] Suggestions failed:", e);
    return [];
  }
}

async function getBGGSuggestions(name: string): Promise<string[]> {
  try {
    const searchUrl = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(name)}&type=boardgame`;
    const searchRes = await axios.get(searchUrl, {
      responseType: "text",
      timeout: 5000,
    });
    const searchData = convertXML(searchRes.data) as BGGResponse;
    const items = searchData.items?.children || [];
    return items
      .slice(0, 5)
      .map((item: any) => {
        return (item.item.children.find(
          (child: BGGChild) => child.name?.type === "primary",
        )?.name?.value || "") as string;
      })
      .filter(Boolean);
  } catch (e) {
    console.warn("[BGG] Suggestions failed:", e);
    return [];
  }
}

export async function getDatabaseSuggestions(
  name: string,
  type?: string | null,
  platform?: string | null,
): Promise<string[]> {
  if (!name || !type) return [];
  const cleanedName = cleanSearchQuery(name);
  if (!cleanedName) return [];
  try {
    let list: string[] = [];
    switch (type) {
      case "games": {
        const rawName = name.trim();
        const rawSuggestions = await getIGDBSuggestions(rawName, platform);
        const hasExactSuggestion = rawSuggestions.some(
          (suggestion) =>
            normalizeSuggestionTitle(suggestion) ===
            normalizeSuggestionTitle(rawName),
        );
        list = hasExactSuggestion
          ? rawSuggestions.filter(
              (suggestion) =>
                normalizeSuggestionTitle(suggestion) ===
                normalizeSuggestionTitle(rawName),
            )
          : Array.from(
              new Set([
                ...rawSuggestions,
                ...(cleanedName.toLowerCase() !== rawName.toLowerCase()
                  ? await getIGDBSuggestions(cleanedName, platform)
                  : []),
              ]),
            );
        break;
      }
      case "movies":
        list = await getTMDBSuggestions(cleanedName);
        break;
      case "books":
        list = await getOpenLibrarySuggestions(cleanedName);
        break;
      case "musics":
        list = await getDeezerSuggestions(cleanedName);
        break;
      case "boardgames":
        list = await getBGGSuggestions(cleanedName);
        break;
    }
    return list.map((item) => decodeHTMLEntities(item));
  } catch (e) {
    console.warn(`[getDatabaseSuggestions] Error for "${name}" (${type}):`, e);
  }
  return [];
}
