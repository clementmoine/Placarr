import axios from "axios";
import levenshtein from "fast-levenshtein";

import type { MetadataFact, MetadataResult } from "@/services/metadata";

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
    const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(name)}&key=${process.env.RAWG_API_KEY}`;
    const res = await axios.get(url);
    const data = res.data;

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
    if (bestMatch.slug) {
      try {
        const detailRes = await axios.get(
          `https://api.rawg.io/api/games/${bestMatch.slug}?key=${process.env.RAWG_API_KEY}`,
        );
        const detail = detailRes.data;
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
      } catch (error) {
        console.warn(`[RAWG] Failed to fetch details for "${bestMatch.slug}"`, error);
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
