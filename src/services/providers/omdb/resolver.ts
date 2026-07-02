import axios from "axios";

import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";

export type OMDbResolveOptions = {
  imdbId?: string | null;
  fallbackNames?: string[];
};

function normalizeOmdbDate(value?: string): string | undefined {
  if (!value || value === "N/A") return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function splitOmdbList(value: unknown): string[] {
  if (typeof value !== "string" || value === "N/A") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildFactsFromOmdbDetails(details: any): MetadataFact[] {
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

  if (typeof details.Metascore === "string" && details.Metascore !== "N/A") {
    facts.push({
      kind: "rating",
      label: "Metascore",
      value: `${details.Metascore}/100`,
      source: "omdb",
      confidence: 0.62,
      priority: 56,
    });
  }

  if (typeof details.imdbVotes === "string" && details.imdbVotes !== "N/A") {
    facts.push({
      kind: "popularity",
      label: "Votes IMDb",
      value: details.imdbVotes.trim(),
      source: "omdb",
      confidence: 0.58,
      priority: 30,
    });
  }

  const directors = splitOmdbList(details.Director);
  const writers = splitOmdbList(details.Writer);
  const actors = splitOmdbList(details.Actors);
  const languages = splitOmdbList(details.Language);
  const countries = splitOmdbList(details.Country);
  const genres = splitOmdbList(details.Genre);
  const productionCompanies = splitOmdbList(details.Production);

  if (writers.length > 0) {
    facts.push({
      kind: "writing",
      label: "Scenario",
      value: writers.slice(0, 4).join(" • "),
      source: "omdb",
      confidence: 0.6,
      priority: 35,
    });
  }
  if (actors.length > 0) {
    facts.push({
      kind: "cast",
      label: "Acteurs",
      value: actors.slice(0, 5).join(" • "),
      source: "omdb",
      confidence: 0.58,
      priority: 32,
    });
  }
  if (languages.length > 0) {
    facts.push({
      kind: "language",
      label: "Langues",
      value: languages.slice(0, 4).join(" • "),
      source: "omdb",
      confidence: 0.64,
      priority: 34,
    });
  }
  if (countries.length > 0) {
    facts.push({
      kind: "release-region",
      label: "Pays",
      value: countries.slice(0, 4).join(" • "),
      source: "omdb",
      confidence: 0.62,
      priority: 33,
    });
  }
  if (genres.length > 0) {
    facts.push({
      kind: "genre",
      label: "Genres",
      value: genres.slice(0, 4).join(" • "),
      source: "omdb",
      confidence: 0.62,
      priority: 36,
    });
  }
  if (typeof details.Awards === "string" && details.Awards !== "N/A") {
    facts.push({
      kind: "award",
      label: "Recompenses",
      value: details.Awards.trim(),
      source: "omdb",
      confidence: 0.56,
      priority: 26,
    });
  }
  if (typeof details.Website === "string" && details.Website !== "N/A") {
    facts.push({
      kind: "source-url",
      label: "Site officiel",
      value: details.Website.trim(),
      url: details.Website.trim(),
      source: "omdb",
      confidence: 0.55,
      priority: 24,
    });
  }
  if (typeof details.BoxOffice === "string" && details.BoxOffice !== "N/A") {
    facts.push({
      kind: "box-office",
      label: "Box office",
      value: details.BoxOffice.trim(),
      source: "omdb",
      confidence: 0.54,
      priority: 23,
    });
  }

  return facts;
}

function buildMetadataFromOmdbDetails(
  details: any,
  fallbackTitle?: string,
): MetadataResult | null {
  if (!details || details.Response === "False") return null;

  const facts = buildFactsFromOmdbDetails(details);
  const poster =
    typeof details.Poster === "string" && details.Poster !== "N/A"
      ? details.Poster
      : null;
  const directors = splitOmdbList(details.Director);
  const writers = splitOmdbList(details.Writer);
  const productionCompanies = splitOmdbList(details.Production);
  const uniqueAuthors = Array.from(new Set([...directors, ...writers])).map(
    (personName) => ({ name: personName }),
  );

  return {
    title: details.Title || fallbackTitle,
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
    authors: uniqueAuthors,
    publishers: productionCompanies.map((company) => ({ name: company })),
    imageUrl: poster || undefined,
    externalIds: {
      imdb:
        typeof details.imdbID === "string" && details.imdbID !== "N/A"
          ? details.imdbID
          : null,
    },
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
}

async function fetchOmdbDetailsByImdbId(apiKey: string, imdbId: string) {
  const detailsRes = await axios.get("https://www.omdbapi.com/", {
    params: { apikey: apiKey, i: imdbId, plot: "short" },
    timeout: 5000,
  });
  return buildMetadataFromOmdbDetails(detailsRes.data);
}

async function fetchOmdbDetailsBySearch(apiKey: string, query: string) {
  const searchRes = await axios.get("https://www.omdbapi.com/", {
    params: { apikey: apiKey, s: query, type: "movie" },
    timeout: 5000,
  });

  const search = searchRes.data;
  if (
    !search ||
    search.Response === "False" ||
    !Array.isArray(search.Search) ||
    search.Search.length === 0
  ) {
    return null;
  }

  const first = search.Search[0];
  if (!first?.imdbID) return null;

  const detailsRes = await axios.get("https://www.omdbapi.com/", {
    params: { apikey: apiKey, i: first.imdbID, plot: "short" },
    timeout: 5000,
  });

  return buildMetadataFromOmdbDetails(detailsRes.data, first.Title);
}

export function createOMDbResolver() {
  return async function fetchFromOMDb(
    name: string,
    options: OMDbResolveOptions = {},
  ): Promise<MetadataResult | null> {
    const key = process.env.OMDB_API_KEY;
    if (!key) return null;

    try {
      if (options.imdbId) {
        const byImdb = await fetchOmdbDetailsByImdbId(key, options.imdbId);
        if (byImdb) return byImdb;
      }

      const queries = Array.from(
        new Set(
          [name, ...(options.fallbackNames || [])]
            .map((query) => query.trim())
            .filter(Boolean),
        ),
      );

      for (const query of queries) {
        const bySearch = await fetchOmdbDetailsBySearch(key, query);
        if (bySearch) return bySearch;
      }

      return null;
    } catch (error) {
      console.warn("[OMDb] resolver failed", error);
      return null;
    }
  };
}
