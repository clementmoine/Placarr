import axios from "axios";
import levenshtein from "fast-levenshtein";

import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";

type RawgResolverDeps = {
  formatScore: (value: number, scale: number) => string | null;
  fetchCoverFromCoverProject: (
    gameName: string,
    platform: string,
  ) => Promise<string | null>;
};

export function createRawgResolver(deps: RawgResolverDeps) {
  return async function fetchFromRawg(
    name: string,
  ): Promise<MetadataResult | null> {
    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const fetchWithRetry = async <T>(
      url: string,
      maxRetries = 2,
    ): Promise<T> => {
      let lastError: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const response = await axios.get<T>(url);
          return response.data;
        } catch (error: unknown) {
          lastError = error;
          const status =
            typeof error === "object" && error !== null && "response" in error
              ? (error as { response?: { status?: number } }).response?.status
              : undefined;
          const isTransient =
            status === 429 || (status !== undefined && status >= 500);
          if (!isTransient || attempt === maxRetries) break;
          await sleep(200 * (attempt + 1));
        }
      }
      throw lastError;
    };

    const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(name)}&key=${process.env.RAWG_API_KEY}`;
    const data = await fetchWithRetry<any>(url, 2);

    if (!data.results || data.results.length === 0) return null;

    let bestMatch = data.results[0];
    let minDistance = levenshtein.get(
      name.toLowerCase(),
      bestMatch.name.toLowerCase(),
    );

    for (const game of data.results) {
      const distance = levenshtein.get(
        name.toLowerCase(),
        game.name.toLowerCase(),
      );
      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = game;
      }
    }

    if (!bestMatch) return null;

    let detailedDescription: string | undefined;
    let detailWebsite: string | undefined;
    let detailTags: string[] = [];
    if (bestMatch.slug) {
      try {
        const detail = await fetchWithRetry<any>(
          `https://api.rawg.io/api/games/${bestMatch.slug}?key=${process.env.RAWG_API_KEY}`,
          2,
        );
        detailTags = Array.isArray(detail?.tags)
          ? detail.tags
              .map((entry: { name?: unknown }) =>
                typeof entry?.name === "string" ? entry.name.trim() : "",
              )
              .filter(Boolean)
          : [];
        if (
          typeof detail?.description_raw === "string" &&
          detail.description_raw.trim()
        ) {
          detailedDescription = detail.description_raw.trim();
        } else if (
          typeof detail?.description === "string" &&
          detail.description.trim()
        ) {
          detailedDescription = detail.description
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
        if (typeof detail?.website === "string" && detail.website.trim()) {
          detailWebsite = detail.website.trim();
        }
      } catch (error) {
        console.warn(
          `[RAWG] Failed to fetch details for "${bestMatch.slug}"`,
          error,
        );
      }
    }

    const platformName = bestMatch.platforms?.[0]?.platform?.name || "";
    let imageUrl = bestMatch.background_image;

    let coverUrl = await deps.fetchCoverFromCoverProject(
      bestMatch.name,
      platformName,
    );
    let coverSource = "rawg";

    if (coverUrl) {
      imageUrl = coverUrl;
      coverSource = "coverproject";
    }

    const facts: MetadataFact[] = [];
    if (typeof bestMatch.metacritic === "number" && bestMatch.metacritic > 0) {
      facts.push({
        kind: "rating",
        label: "Metacritic",
        value: `${Math.round(bestMatch.metacritic)}/100`,
        source: "RAWG",
        confidence: 0.78,
        priority: 82,
      });
    }
    if (typeof bestMatch.rating === "number" && bestMatch.rating > 0) {
      const rating = deps.formatScore(bestMatch.rating, 5);
      if (rating) {
        facts.push({
          kind: "rating",
          label: "RAWG",
          value: rating,
          source: "RAWG",
          confidence: 0.7,
          priority: 72,
        });
      }
    }

    if (typeof bestMatch.playtime === "number" && bestMatch.playtime > 0) {
      facts.push({
        kind: "duration",
        label: "Temps de jeu",
        value: `${Math.round(bestMatch.playtime)} h`,
        source: "RAWG",
        confidence: 0.63,
        priority: 44,
      });
    }

    const platformNames = Array.isArray(bestMatch.platforms)
      ? bestMatch.platforms
          .map((entry: any) => entry?.platform?.name)
          .filter(
            (entry: unknown): entry is string => typeof entry === "string",
          )
      : [];
    if (platformNames.length > 0) {
      facts.push({
        kind: "platform",
        label: "Plateformes",
        value: Array.from(new Set(platformNames)).slice(0, 6).join(" • "),
        source: "RAWG",
        confidence: 0.66,
        priority: 45,
      });
    }

    const storeNames = Array.isArray(bestMatch.stores)
      ? bestMatch.stores
          .map((entry: any) => entry?.store?.name)
          .filter(
            (entry: unknown): entry is string => typeof entry === "string",
          )
      : [];
    if (storeNames.length > 0) {
      facts.push({
        kind: "store",
        label: "Stores",
        value: Array.from(new Set(storeNames)).slice(0, 6).join(" • "),
        source: "RAWG",
        confidence: 0.58,
        priority: 22,
      });
    }

    const genreNames = Array.isArray(bestMatch.genres)
      ? bestMatch.genres
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
        source: "RAWG",
        confidence: 0.62,
        priority: 40,
      });
    }

    const tagNames = [
      ...(Array.isArray(bestMatch.tags)
        ? bestMatch.tags
            .map((entry: { name?: unknown }) =>
              typeof entry?.name === "string" ? entry.name.trim() : "",
            )
            .filter(Boolean)
        : []),
      ...detailTags,
    ];
    if (tagNames.length > 0) {
      facts.push({
        kind: "tag",
        label: "Tags",
        value: Array.from(new Set(tagNames)).slice(0, 8).join(" • "),
        source: "RAWG",
        confidence: 0.58,
        priority: 36,
      });
    }

    const parentPlatformNames = Array.isArray(bestMatch.parent_platforms)
      ? bestMatch.parent_platforms
          .map((entry: { platform?: { name?: unknown } }) =>
            typeof entry?.platform?.name === "string"
              ? entry.platform.name.trim()
              : "",
          )
          .filter(Boolean)
      : [];
    if (parentPlatformNames.length > 0) {
      facts.push({
        kind: "platform",
        label: "Plateformes parentes",
        value: Array.from(new Set(parentPlatformNames)).slice(0, 6).join(" • "),
        source: "RAWG",
        confidence: 0.64,
        priority: 44,
      });
    }

    if (
      typeof bestMatch.reviews_count === "number" &&
      bestMatch.reviews_count > 0
    ) {
      facts.push({
        kind: "rating",
        label: "Avis RAWG",
        value: new Intl.NumberFormat("fr-FR").format(bestMatch.reviews_count),
        source: "RAWG",
        confidence: 0.6,
        priority: 68,
      });
    }

    if (detailWebsite) {
      facts.push({
        kind: "source-url",
        label: "Site officiel",
        value: detailWebsite,
        url: detailWebsite,
        source: "RAWG",
        confidence: 0.57,
        priority: 21,
      });
    }

    return {
      title: bestMatch.name,
      description: detailedDescription,
      releaseDate: bestMatch.released,
      imageUrl,
      attachments: [
        ...(imageUrl
          ? [
              {
                type: "cover" as const,
                url: imageUrl,
                source: coverSource,
              },
            ]
          : []),
        ...(bestMatch.short_screenshots?.map((s: { image: string }) => ({
          type: "screenshot" as const,
          url: s.image,
          source: "rawg",
        })) || []),
      ],
      facts: facts.length > 0 ? facts : undefined,
    };
  };
}
