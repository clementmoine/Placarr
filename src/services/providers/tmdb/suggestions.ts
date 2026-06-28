import axios from "axios";

import { cleanSearchQuery } from "@/lib/search/query";
import { parseTMDBSeriesIntent } from "./resolver";

export async function getTMDBSuggestions(name: string): Promise<string[]> {
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
      .map((movie: { title?: string }) => movie.title as string)
      .filter(Boolean);
    const tvSuggestions = (tvRes.data?.results || [])
      .slice(0, 5)
      .map((show: { name?: string }) =>
        seriesIntent.seasonNumber
          ? `${show.name} - Saison ${seriesIntent.seasonNumber}`
          : (show.name as string),
      )
      .filter(Boolean);

    return Array.from(
      new Set(
        seriesIntent.isSeriesLike
          ? [...tvSuggestions, ...movieSuggestions]
          : [...movieSuggestions, ...tvSuggestions],
      ),
    ).slice(0, 5);
  } catch (error) {
    console.warn("[TMDB] Suggestions failed:", error);
    return [];
  }
}
