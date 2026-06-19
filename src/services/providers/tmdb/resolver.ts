import axios from "axios";
import levenshtein from "fast-levenshtein";

import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";

export type TMDBSeriesIntent = {
  isSeriesLike: boolean;
  searchTitle: string;
  seasonNumber?: number;
};

type TMDBSearchResult = {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
};

export function parseTMDBSeriesIntent(
  name: string,
  cleanSearchQuery: (value: string) => string,
): TMDBSeriesIntent {
  const seasonMatch =
    name.match(/\b(?:saison|season)\s*(\d{1,2})\b/i) ||
    name.match(/\bs(?:eason)?\s*(\d{1,2})\b/i);
  const isSeriesLike =
    /\b(saison|season|series|s[eé]rie|episode|[ée]pisode|vol(?:ume)?\.?)\b/i.test(
      name,
    ) || Boolean(seasonMatch);

  let searchTitle = name
    .replace(/\b(?:saison|season)\s*\d{1,2}\b/gi, "")
    .replace(/\bs(?:eason)?\s*\d{1,2}\b/gi, "")
    .replace(/\b(?:episode|[ée]pisode)\s*\d{1,3}\b/gi, "")
    .replace(/\bvol(?:ume)?\.?\s*\d{1,3}\b/gi, "")
    .replace(/\b(dvd|blu[\s-]?ray|bluray|coffret|box)\b/gi, "")
    .replace(/\s*[-–—:|]+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!searchTitle) searchTitle = cleanSearchQuery(name) || name;

  return {
    isSeriesLike,
    searchTitle,
    seasonNumber: seasonMatch ? Number(seasonMatch[1]) : undefined,
  };
}

function pickBestTMDBMatch<T extends { title?: string; name?: string }>(
  query: string,
  results: T[],
): T | null {
  if (results.length === 0) return null;

  const normalizedQuery = query.toLowerCase();
  let bestMatch = results[0];
  let minDistance = Number.POSITIVE_INFINITY;

  for (const result of results) {
    const titles = [result.title, result.name].filter(Boolean) as string[];
    const distance = Math.min(
      ...titles.map((title) =>
        levenshtein.get(normalizedQuery, title.toLowerCase()),
      ),
    );
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = result;
    }
  }

  return bestMatch;
}

type TmdbResolverDeps = {
  formatScore: (value: number, scale: number) => string | null;
  cleanSearchQuery: (value: string) => string;
};

export function createTMDBResolver(deps: TmdbResolverDeps) {
  async function fetchFromTMDBMovie(
    name: string,
  ): Promise<MetadataResult | null> {
    const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(name)}&api_key=${process.env.TMDB_API_KEY}&language=fr-FR`;
    const res = await axios.get(searchUrl);
    const data = res.data;

    if (!data.results || data.results.length === 0) return null;

    let bestMatch = data.results[0];
    let minDistance = levenshtein.get(
      name.toLowerCase(),
      bestMatch.title.toLowerCase(),
    );

    for (const movie of data.results) {
      const distance = levenshtein.get(
        name.toLowerCase(),
        movie.title.toLowerCase(),
      );
      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = movie;
      }
    }

    const detailsRes = await axios.get(
      `https://api.themoviedb.org/3/movie/${bestMatch.id}?api_key=${process.env.TMDB_API_KEY}&language=fr-FR`,
    );
    const details = detailsRes.data;

    const creditsRes = await axios.get(
      `https://api.themoviedb.org/3/movie/${bestMatch.id}/credits?api_key=${process.env.TMDB_API_KEY}&language=fr-FR`,
    );
    const credits = creditsRes.data;

    let imagesData: {
      posters?: { file_path: string }[];
      backdrops?: { file_path: string }[];
      logos?: { file_path: string }[];
    } = {};
    try {
      const imagesRes = await axios.get(
        `https://api.themoviedb.org/3/movie/${bestMatch.id}/images?api_key=${process.env.TMDB_API_KEY}`,
      );
      imagesData = imagesRes.data;
    } catch (err) {
      console.error(
        `[TMDB] Failed to fetch images for movie ID ${bestMatch.id}:`,
        err,
      );
    }

    const tmdbPosters = (imagesData.posters || [])
      .slice(0, 30)
      .map((img: { file_path: string }) => ({
        type: "cover" as const,
        url: `https://image.tmdb.org/t/p/w780${img.file_path}`,
        source: "tmdb",
      }));

    const tmdbBackdrops = (imagesData.backdrops || [])
      .slice(0, 30)
      .map((img: { file_path: string }) => ({
        type: "background" as const,
        url: `https://image.tmdb.org/t/p/w1280${img.file_path}`,
        source: "tmdb",
      }));

    const tmdbLogos = (imagesData.logos || [])
      .slice(0, 10)
      .map((img: { file_path: string }) => ({
        type: "logo" as const,
        url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
        source: "tmdb",
      }));

    const coverUrl = bestMatch.poster_path
      ? `https://image.tmdb.org/t/p/w780${bestMatch.poster_path}`
      : null;

    let aliases: string[] = [];
    try {
      const titlesRes = await axios.get(
        `https://api.themoviedb.org/3/movie/${bestMatch.id}/alternative_titles?api_key=${process.env.TMDB_API_KEY}`,
      );
      aliases = (titlesRes.data?.titles || [])
        .map((t: any) => t.title as string)
        .filter(
          (t: string) =>
            t.toLowerCase().trim() !== bestMatch.title.toLowerCase().trim(),
        );
    } catch (err) {
      console.error(
        `[TMDB] Failed to fetch alternative titles for movie ID ${bestMatch.id}:`,
        err,
      );
    }

    let certification: string | null = null;
    try {
      const releaseDatesRes = await axios.get(
        `https://api.themoviedb.org/3/movie/${bestMatch.id}/release_dates?api_key=${process.env.TMDB_API_KEY}`,
      );
      const countries = releaseDatesRes.data?.results || [];
      const preferredCountries = ["FR", "BE", "CA", "US", "GB"];
      for (const iso of preferredCountries) {
        const country = countries.find(
          (entry: any) => entry.iso_3166_1 === iso,
        );
        const cert = country?.release_dates?.find(
          (date: any) =>
            typeof date.certification === "string" && date.certification.trim(),
        )?.certification;
        if (cert) {
          certification = iso === "FR" ? cert : `${iso} ${cert}`;
          break;
        }
      }
    } catch (err) {
      console.error(
        `[TMDB] Failed to fetch release dates for movie ID ${bestMatch.id}:`,
        err,
      );
    }

    const facts: MetadataFact[] = [];
    if (certification) {
      facts.push({
        kind: "age-rating",
        label: "Classification",
        value: certification,
        source: "tmdb",
        confidence: 0.78,
        priority: 75,
      });
    }
    if (typeof details.vote_average === "number" && details.vote_average > 0) {
      const rating = deps.formatScore(details.vote_average, 10);
      if (rating) {
        facts.push({
          kind: "rating",
          label: "TMDB",
          value: rating,
          source: "tmdb",
          confidence: 0.72,
          priority: 80,
        });
      }
    }
    const genreNames = Array.isArray(details.genres)
      ? details.genres
          .map((entry: any) => entry?.name)
          .filter(
            (entry: unknown): entry is string => typeof entry === "string",
          )
      : [];
    if (genreNames.length > 0) {
      facts.push({
        kind: "genre",
        label: "Genres",
        value: Array.from(new Set(genreNames)).slice(0, 5).join(" • "),
        source: "tmdb",
        confidence: 0.66,
        priority: 46,
      });
    }
    if (
      typeof details.original_language === "string" &&
      details.original_language.trim()
    ) {
      facts.push({
        kind: "language",
        label: "Langue originale",
        value: details.original_language.trim().toUpperCase(),
        source: "tmdb",
        confidence: 0.6,
        priority: 34,
      });
    }
    const productionCountries = Array.isArray(details.production_countries)
      ? details.production_countries
          .map((entry: any) => entry?.name || entry?.iso_3166_1)
          .filter(
            (entry: unknown): entry is string => typeof entry === "string",
          )
      : [];
    if (productionCountries.length > 0) {
      facts.push({
        kind: "release-region",
        label: "Pays de production",
        value: Array.from(new Set(productionCountries)).slice(0, 4).join(" • "),
        source: "tmdb",
        confidence: 0.58,
        priority: 29,
      });
    }
    if (typeof details.homepage === "string" && details.homepage.trim()) {
      facts.push({
        kind: "source-url",
        label: "Site officiel",
        value: details.homepage.trim(),
        url: details.homepage.trim(),
        source: "tmdb",
        confidence: 0.58,
        priority: 22,
      });
    }
    if (details.adult === true) {
      facts.push({
        kind: "content-warning",
        label: "Contenu adulte",
        value: "Oui",
        source: "tmdb",
        confidence: 0.74,
        priority: 55,
      });
    }

    return {
      title: bestMatch.title,
      authors: credits.crew
        .filter((person: { job: string }) => person.job === "Director")
        .map((person: { name: string; profile_path: string }) => ({
          name: person.name,
          imageUrl: person.profile_path
            ? `https://image.tmdb.org/t/p/w780${person.profile_path}`
            : null,
        })),
      publishers: details.production_companies.map(
        (company: { name: string; logo_path: string }) => ({
          name: company.name,
          imageUrl: company.logo_path
            ? `https://image.tmdb.org/t/p/w780${company.logo_path}`
            : null,
        }),
      ),
      duration: details.runtime,
      description: details.overview,
      releaseDate: details.release_date,
      imageUrl: coverUrl || undefined,
      attachments: [
        ...(coverUrl && !tmdbPosters.some((p) => p.url === coverUrl)
          ? [
              {
                type: "cover" as const,
                url: coverUrl,
                source: "tmdb",
              },
            ]
          : []),
        ...tmdbPosters,
        ...(bestMatch.backdrop_path &&
        !tmdbBackdrops.some(
          (b) =>
            b.url ===
            `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`,
        )
          ? [
              {
                type: "background" as const,
                url: `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`,
                source: "tmdb",
              },
            ]
          : []),
        ...tmdbBackdrops,
        ...tmdbLogos,
      ],
      aliases,
      facts: facts.length > 0 ? facts : undefined,
    };
  }

  async function fetchFromTMDBSeries(
    name: string,
  ): Promise<MetadataResult | null> {
    const intent = parseTMDBSeriesIntent(name, deps.cleanSearchQuery);
    const searchUrl = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(intent.searchTitle)}&api_key=${process.env.TMDB_API_KEY}&language=fr-FR`;
    const res = await axios.get(searchUrl);
    const data = res.data;

    if (!data.results || data.results.length === 0) return null;

    const bestMatch = pickBestTMDBMatch(
      intent.searchTitle,
      data.results as TMDBSearchResult[],
    );
    if (!bestMatch) return null;

    const detailsRes = await axios.get(
      `https://api.themoviedb.org/3/tv/${bestMatch.id}?api_key=${process.env.TMDB_API_KEY}&language=fr-FR`,
    );
    const details = detailsRes.data;

    let seasonDetails: any | null = null;
    if (intent.seasonNumber) {
      try {
        const seasonRes = await axios.get(
          `https://api.themoviedb.org/3/tv/${bestMatch.id}/season/${intent.seasonNumber}?api_key=${process.env.TMDB_API_KEY}&language=fr-FR`,
        );
        seasonDetails = seasonRes.data;
      } catch (err) {
        console.error(
          `[TMDB] Failed to fetch season ${intent.seasonNumber} for TV ID ${bestMatch.id}:`,
          err,
        );
      }
    }

    let imagesData: {
      posters?: { file_path: string }[];
      backdrops?: { file_path: string }[];
      logos?: { file_path: string }[];
    } = {};
    try {
      const imagesRes = await axios.get(
        `https://api.themoviedb.org/3/tv/${bestMatch.id}/images?api_key=${process.env.TMDB_API_KEY}`,
      );
      imagesData = imagesRes.data;
    } catch (err) {
      console.error(
        `[TMDB] Failed to fetch images for TV ID ${bestMatch.id}:`,
        err,
      );
    }

    let seasonImagesData: { posters?: { file_path: string }[] } = {};
    if (intent.seasonNumber) {
      try {
        const seasonImagesRes = await axios.get(
          `https://api.themoviedb.org/3/tv/${bestMatch.id}/season/${intent.seasonNumber}/images?api_key=${process.env.TMDB_API_KEY}`,
        );
        seasonImagesData = seasonImagesRes.data;
      } catch (err) {
        console.error(
          `[TMDB] Failed to fetch season images for TV ID ${bestMatch.id}:`,
          err,
        );
      }
    }

    const seasonPosters = (seasonImagesData.posters || [])
      .slice(0, 20)
      .map((img: { file_path: string }) => ({
        type: "cover" as const,
        url: `https://image.tmdb.org/t/p/w780${img.file_path}`,
        source: "tmdb",
      }));

    const tmdbPosters = (imagesData.posters || [])
      .slice(0, 30)
      .map((img: { file_path: string }) => ({
        type: "cover" as const,
        url: `https://image.tmdb.org/t/p/w780${img.file_path}`,
        source: "tmdb",
      }));

    const tmdbBackdrops = (imagesData.backdrops || [])
      .slice(0, 30)
      .map((img: { file_path: string }) => ({
        type: "background" as const,
        url: `https://image.tmdb.org/t/p/w1280${img.file_path}`,
        source: "tmdb",
      }));

    const tmdbLogos = (imagesData.logos || [])
      .slice(0, 10)
      .map((img: { file_path: string }) => ({
        type: "logo" as const,
        url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
        source: "tmdb",
      }));

    const seasonCoverUrl = seasonDetails?.poster_path
      ? `https://image.tmdb.org/t/p/w780${seasonDetails.poster_path}`
      : null;
    const coverUrl =
      seasonCoverUrl ||
      (bestMatch.poster_path
        ? `https://image.tmdb.org/t/p/w780${bestMatch.poster_path}`
        : null);

    let aliases: string[] = [];
    try {
      const titlesRes = await axios.get(
        `https://api.themoviedb.org/3/tv/${bestMatch.id}/alternative_titles?api_key=${process.env.TMDB_API_KEY}`,
      );
      aliases = (titlesRes.data?.results || [])
        .map((t: any) => (t.title || t.name) as string)
        .filter(Boolean)
        .filter(
          (t: string) =>
            t.toLowerCase().trim() !==
            String(details.name || bestMatch.name)
              .toLowerCase()
              .trim(),
        );
    } catch (err) {
      console.error(
        `[TMDB] Failed to fetch alternative titles for TV ID ${bestMatch.id}:`,
        err,
      );
    }

    let certification: string | null = null;
    try {
      const ratingsRes = await axios.get(
        `https://api.themoviedb.org/3/tv/${bestMatch.id}/content_ratings?api_key=${process.env.TMDB_API_KEY}`,
      );
      const countries = ratingsRes.data?.results || [];
      const preferredCountries = ["FR", "BE", "CA", "US", "GB"];
      for (const iso of preferredCountries) {
        const country = countries.find(
          (entry: any) => entry.iso_3166_1 === iso,
        );
        const rating =
          typeof country?.rating === "string" && country.rating.trim()
            ? country.rating
            : null;
        if (rating) {
          certification = iso === "FR" ? rating : `${iso} ${rating}`;
          break;
        }
      }
    } catch (err) {
      console.error(
        `[TMDB] Failed to fetch content ratings for TV ID ${bestMatch.id}:`,
        err,
      );
    }

    const facts: MetadataFact[] = [];
    if (certification) {
      facts.push({
        kind: "age-rating",
        label: "Classification",
        value: certification,
        source: "tmdb",
        confidence: 0.78,
        priority: 75,
      });
    }
    if (typeof details.vote_average === "number" && details.vote_average > 0) {
      const rating = deps.formatScore(details.vote_average, 10);
      if (rating) {
        facts.push({
          kind: "rating",
          label: "TMDB",
          value: rating,
          source: "tmdb",
          confidence: 0.72,
          priority: 80,
        });
      }
    }
    const genreNames = Array.isArray(details.genres)
      ? details.genres
          .map((entry: any) => entry?.name)
          .filter(
            (entry: unknown): entry is string => typeof entry === "string",
          )
      : [];
    if (genreNames.length > 0) {
      facts.push({
        kind: "genre",
        label: "Genres",
        value: Array.from(new Set(genreNames)).slice(0, 5).join(" • "),
        source: "tmdb",
        confidence: 0.66,
        priority: 46,
      });
    }
    if (
      typeof details.original_language === "string" &&
      details.original_language.trim()
    ) {
      facts.push({
        kind: "language",
        label: "Langue originale",
        value: details.original_language.trim().toUpperCase(),
        source: "tmdb",
        confidence: 0.6,
        priority: 34,
      });
    }
    const originCountries = Array.isArray(details.origin_country)
      ? details.origin_country.filter(
          (entry: unknown): entry is string => typeof entry === "string",
        )
      : [];
    if (originCountries.length > 0) {
      facts.push({
        kind: "release-region",
        label: "Pays de diffusion",
        value: Array.from(new Set(originCountries)).slice(0, 4).join(" • "),
        source: "tmdb",
        confidence: 0.58,
        priority: 29,
      });
    }
    if (typeof details.homepage === "string" && details.homepage.trim()) {
      facts.push({
        kind: "source-url",
        label: "Site officiel",
        value: details.homepage.trim(),
        url: details.homepage.trim(),
        source: "tmdb",
        confidence: 0.58,
        priority: 22,
      });
    }
    if (details.adult === true) {
      facts.push({
        kind: "content-warning",
        label: "Contenu adulte",
        value: "Oui",
        source: "tmdb",
        confidence: 0.74,
        priority: 55,
      });
    }

    const seriesTitle = details.name || bestMatch.name;
    const displayTitle = intent.seasonNumber
      ? `${seriesTitle} - Saison ${intent.seasonNumber}`
      : seriesTitle;
    const releaseDate = seasonDetails?.air_date || details.first_air_date;
    const runtime = Array.isArray(details.episode_run_time)
      ? details.episode_run_time.find(
          (value: unknown) => typeof value === "number" && value > 0,
        )
      : undefined;

    return {
      title: displayTitle,
      authors:
        details.created_by?.map(
          (person: { name: string; profile_path?: string | null }) => ({
            name: person.name,
            imageUrl: person.profile_path
              ? `https://image.tmdb.org/t/p/w780${person.profile_path}`
              : null,
          }),
        ) || [],
      publishers:
        details.production_companies?.map(
          (company: { name: string; logo_path?: string | null }) => ({
            name: company.name,
            imageUrl: company.logo_path
              ? `https://image.tmdb.org/t/p/w780${company.logo_path}`
              : null,
          }),
        ) || [],
      duration: runtime,
      description: seasonDetails?.overview || details.overview,
      releaseDate,
      imageUrl: coverUrl || undefined,
      attachments: [
        ...(coverUrl &&
        !seasonPosters.some((p) => p.url === coverUrl) &&
        !tmdbPosters.some((p) => p.url === coverUrl)
          ? [
              {
                type: "cover" as const,
                url: coverUrl,
                source: "tmdb",
              },
            ]
          : []),
        ...seasonPosters,
        ...tmdbPosters,
        ...(bestMatch.backdrop_path &&
        !tmdbBackdrops.some(
          (b) =>
            b.url ===
            `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`,
        )
          ? [
              {
                type: "background" as const,
                url: `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`,
                source: "tmdb",
              },
            ]
          : []),
        ...tmdbBackdrops,
        ...tmdbLogos,
      ],
      aliases,
      facts: facts.length > 0 ? facts : undefined,
    };
  }

  return async function fetchFromTMDB(
    name: string,
  ): Promise<MetadataResult | null> {
    const seriesIntent = parseTMDBSeriesIntent(name, deps.cleanSearchQuery);

    if (seriesIntent.isSeriesLike) {
      const tvResult = await fetchFromTMDBSeries(name);
      if (tvResult) return tvResult;
      return fetchFromTMDBMovie(name);
    }

    const movieResult = await fetchFromTMDBMovie(name);
    if (movieResult) return movieResult;
    return fetchFromTMDBSeries(name);
  };
}
