import axios from "axios";

import type { MetadataFact, MetadataResult } from "@/services/metadata";

function normalizeOmdbDate(value?: string): string | undefined {
  if (!value || value === "N/A") return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

export function createOMDbResolver() {
  return async function fetchFromOMDb(
    name: string,
  ): Promise<MetadataResult | null> {
    const key = process.env.OMDB_API_KEY;
    if (!key) return null;

    try {
      const searchRes = await axios.get("https://www.omdbapi.com/", {
        params: { apikey: key, s: name, type: "movie" },
        timeout: 5000,
      });

      const search = searchRes.data;
      if (!search || search.Response === "False" || !Array.isArray(search.Search)) {
        return null;
      }

      const first = search.Search[0];
      if (!first?.imdbID) return null;

      const detailsRes = await axios.get("https://www.omdbapi.com/", {
        params: { apikey: key, i: first.imdbID, plot: "short" },
        timeout: 5000,
      });
      const details = detailsRes.data;
      if (!details || details.Response === "False") return null;

      const facts: MetadataFact[] = [];
      const ageRating =
        typeof details.Rated === "string" && details.Rated !== "N/A"
          ? details.Rated.trim()
          : null;
      if (ageRating) {
        facts.push({
          kind: "age-rating",
          label: "Classification",
          value: ageRating,
          source: "omdb",
          confidence: 0.68,
          priority: 62,
        });
      }

      if (Array.isArray(details.Ratings)) {
        for (const rating of details.Ratings) {
          if (!rating?.Value || rating.Value === "N/A") continue;
          facts.push({
            kind: "rating",
            label: rating.Source || "OMDb",
            value: String(rating.Value),
            source: "omdb",
            confidence: 0.64,
            priority: 60,
          });
        }
      } else if (
        typeof details.imdbRating === "string" &&
        details.imdbRating !== "N/A"
      ) {
        facts.push({
          kind: "rating",
          label: "IMDb",
          value: `${details.imdbRating}/10`,
          source: "omdb",
          confidence: 0.64,
          priority: 60,
        });
      }

      const poster =
        typeof details.Poster === "string" && details.Poster !== "N/A"
          ? details.Poster
          : null;

      const directors =
        typeof details.Director === "string" && details.Director !== "N/A"
          ? details.Director.split(",").map((entry: string) => ({
              name: entry.trim(),
            }))
          : [];

      return {
        title: details.Title || first.Title,
        description:
          typeof details.Plot === "string" && details.Plot !== "N/A"
            ? details.Plot
            : undefined,
        releaseDate: normalizeOmdbDate(details.Released),
        duration:
          typeof details.Runtime === "string" &&
          details.Runtime !== "N/A" &&
          /\d+/.test(details.Runtime)
            ? Number(details.Runtime.match(/\d+/)?.[0])
            : undefined,
        authors: directors,
        imageUrl: poster || undefined,
        attachments: poster
          ? [
              {
                type: "cover",
                url: poster,
                source: "omdb",
              },
            ]
          : [],
        facts: facts.length > 0 ? facts : undefined,
      };
    } catch (error) {
      console.warn("[OMDb] resolver failed", error);
      return null;
    }
  };
}
