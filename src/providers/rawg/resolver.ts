import axios from "axios";

import {
  isMetadataTitleAligned,
  metadataTitleSimilarity,
} from "@/core/enrich/titleMatching";
import { detectVideoGamePlatformKey } from "@/core/identify/platforms/platforms";

type RawgNamedEntry = { name?: string };
type RawgClipEntry = { clip?: string; preview?: string; video?: string };
type RawgGame = {
  id?: number;
  slug?: string;
  name: string;
  name_original?: string;
  alternative_names?: Array<string | { name?: string }>;
  released?: string;
  rating?: number;
  reviews_count?: number;
  metacritic?: number | null;
  playtime?: number;
  background_image?: string | null;
  short_screenshots?: Array<{ image: string }>;
  platforms?: Array<{ platform?: RawgNamedEntry }>;
  parent_platforms?: Array<{ platform?: RawgNamedEntry }>;
  stores?: Array<{ store?: RawgNamedEntry }>;
  genres?: RawgNamedEntry[];
  tags?: RawgNamedEntry[];
  description?: string;
  description_raw?: string;
  website?: string;
  clips?: { clips?: RawgClipEntry[] };
};
type RawgSearchResponse = { results?: RawgGame[] };

import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
import {
  resolveGameAttachmentPlatformKey,
  solePlatformKeyFromNames,
  withMetadataPlatformKeys,
} from "@/core/enrich/media/platformKeyStamp";
import { catalogAliasesFromNames } from "@/core/enrich/aliases";
import { isRawgQuotaBlocked, markRawgQuotaHit } from "./quota";

type RawgResolverDeps = {
  formatScore: (value: number, scale: number) => string | null;
  fetchCoverFromCoverProject: (
    gameName: string,
    platform: string,
  ) => Promise<string | null>;
};

function readAxiosStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "response" in error
    ? (error as { response?: { status?: number } }).response?.status
    : undefined;
}

function rawgGamePlatformKeys(game: Pick<RawgGame, "platforms">): Set<string> {
  const keys = new Set<string>();
  for (const entry of game.platforms || []) {
    const name = entry?.platform?.name;
    if (typeof name !== "string" || !name.trim()) continue;
    const key = detectVideoGamePlatformKey(name);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Drop unresolved browser noise ("Web") when RAWG also lists real platforms.
 * Keep brand parents ("Nintendo") even without a console key.
 */
export function preferResolvedRawgPlatformNames(
  names: readonly string[],
): string[] {
  const unique = Array.from(
    new Set(names.map((name) => name.trim()).filter(Boolean)),
  ).filter((name) => !/^web$/i.test(name));
  const resolved = unique.filter((name) => detectVideoGamePlatformKey(name));
  if (resolved.length === 0) return unique;
  return unique.filter(
    (name) => detectVideoGamePlatformKey(name) || !/^web$/i.test(name),
  );
}

/** itch.io / mobile storefronts are fangame noise on a cartridge shelf. */
export function filterRawgStoresForShelf(
  stores: readonly string[],
  requestedPlatform?: string | null,
): string[] {
  const unique = Array.from(
    new Set(stores.map((name) => name.trim()).filter(Boolean)),
  );
  const requestedKey = requestedPlatform
    ? detectVideoGamePlatformKey(requestedPlatform)
    : null;
  if (!requestedKey || requestedKey === "pc") return unique;
  return unique.filter((name) => !/\bitch\.io\b/i.test(name));
}

/**
 * Drop community fangame tags when the hit is on a retail console shelf.
 * Structural (shelf platform), not a product-title word list.
 */
export function filterRawgTagsForShelf(
  tags: readonly string[],
  requestedPlatform?: string | null,
): string[] {
  const unique = Array.from(
    new Set(tags.map((name) => name.trim()).filter(Boolean)),
  );
  const requestedKey = requestedPlatform
    ? detectVideoGamePlatformKey(requestedPlatform)
    : null;
  if (!requestedKey || requestedKey === "pc") return unique;
  return unique.filter((name) => !/\b(fangame|gamemaker|horror)\b/i.test(name));
}

/**
 * Pick a RAWG search hit by title alignment, preferring the shelf platform.
 * A Web/itch fangame must not win over a missing retail Game Boy match.
 */
export function pickRawgSearchMatch(
  results: readonly Pick<RawgGame, "name" | "platforms">[],
  query: string,
  platform?: string | null,
): Pick<RawgGame, "name" | "platforms"> | null {
  const cleanedQuery = query.trim();
  if (!cleanedQuery || results.length === 0) return null;

  const requestedKey = platform ? detectVideoGamePlatformKey(platform) : null;

  const aligned = results.filter((game) =>
    isMetadataTitleAligned({ title: game.name }, [cleanedQuery], 0.58),
  );
  if (aligned.length === 0) return null;

  let pool = aligned;
  if (requestedKey) {
    const onShelf = aligned.filter((game) =>
      rawgGamePlatformKeys(game).has(requestedKey),
    );
    // Honest empty beats a confident wrong product (fangame / wrong platform).
    if (onShelf.length === 0) return null;
    pool = onShelf;
  }

  let best = pool[0];
  let bestScore = metadataTitleSimilarity(cleanedQuery, best.name);
  for (const game of pool.slice(1)) {
    const score = metadataTitleSimilarity(cleanedQuery, game.name);
    if (score > bestScore) {
      bestScore = score;
      best = game;
    }
  }
  return best;
}

/** First gameplay / trailer clip from a RAWG game detail payload. */
export function readRawgGameplayClip(
  detail: Pick<RawgGame, "clips"> | null | undefined,
): { url: string; label: string } | null {
  const entries = detail?.clips?.clips;
  if (!Array.isArray(entries)) return null;

  for (const entry of entries) {
    const url = typeof entry.clip === "string" ? entry.clip.trim() : "";
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const label =
      typeof entry.video === "string" && entry.video.trim()
        ? entry.video.trim()
        : "Gameplay";
    return { url, label };
  }

  return null;
}

/** Official alternate titles from a RAWG game detail payload. */
export function readRawgCatalogAliases(
  detail:
    | Pick<RawgGame, "name_original" | "alternative_names">
    | null
    | undefined,
): string[] {
  if (!detail) return [];
  const names: string[] = [];
  if (typeof detail.name_original === "string" && detail.name_original.trim()) {
    names.push(detail.name_original.trim());
  }
  for (const entry of detail.alternative_names || []) {
    if (typeof entry === "string" && entry.trim()) {
      names.push(entry.trim());
      continue;
    }
    if (
      entry &&
      typeof entry === "object" &&
      typeof entry.name === "string" &&
      entry.name.trim()
    ) {
      names.push(entry.name.trim());
    }
  }
  return names;
}

export function createRawgResolver(deps: RawgResolverDeps) {
  return async function fetchFromRawg(
    name: string,
    platform?: string | null,
  ): Promise<MetadataResult | null> {
    if (!process.env.RAWG_API_KEY?.trim() || isRawgQuotaBlocked()) {
      return null;
    }

    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const fetchWithRetry = async <T>(
      url: string,
      maxRetries = 2,
    ): Promise<T | null> => {
      let lastError: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const response = await axios.get<T>(url);
          return response.data;
        } catch (error: unknown) {
          lastError = error;
          const status = readAxiosStatus(error);
          if (status === 429) {
            markRawgQuotaHit({ rateLimited: true });
            console.warn(
              "[RAWG] Rate limit exceeded — pausing lookups for 20m",
            );
            return null;
          }
          if (status === 401) {
            markRawgQuotaHit({ authFailure: true });
            console.warn(
              "[RAWG] Unauthorized API key — pausing lookups for 1h",
            );
            return null;
          }
          const isTransient = status !== undefined && status >= 500;
          if (!isTransient || attempt === maxRetries) break;
          await sleep(200 * (attempt + 1));
        }
      }
      if (lastError) {
        console.warn(
          `[RAWG] Request failed for "${name}"`,
          lastError instanceof Error ? lastError.message : String(lastError),
        );
      }
      return null;
    };

    const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(name)}&key=${process.env.RAWG_API_KEY}`;
    const data = await fetchWithRetry<RawgSearchResponse>(url, 2);

    if (!data?.results || data.results.length === 0) return null;

    const bestMatch = pickRawgSearchMatch(
      data.results,
      name,
      platform,
    ) as RawgGame | null;
    if (!bestMatch) return null;

    let detailedDescription: string | undefined;
    let detailWebsite: string | undefined;
    let detailTags: string[] = [];
    let detailAliases: string[] = [];
    let gameplayClip: { url: string; label: string } | null = null;
    if (bestMatch.slug) {
      try {
        const detail = await fetchWithRetry<RawgGame>(
          `https://api.rawg.io/api/games/${bestMatch.slug}?key=${process.env.RAWG_API_KEY}`,
          2,
        );
        gameplayClip = readRawgGameplayClip(detail);
        detailTags = Array.isArray(detail?.tags)
          ? detail.tags
              .map((entry: { name?: unknown }) =>
                typeof entry?.name === "string" ? entry.name.trim() : "",
              )
              .filter(Boolean)
          : [];
        detailAliases = readRawgCatalogAliases(detail);
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
    let imageUrl = bestMatch.background_image ?? undefined;

    const coverUrl = await deps.fetchCoverFromCoverProject(
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

    const platformNames = preferResolvedRawgPlatformNames(
      Array.isArray(bestMatch.platforms)
        ? bestMatch.platforms
            .map((entry: { platform?: { name?: unknown } }) =>
              typeof entry?.platform?.name === "string"
                ? entry.platform.name.trim()
                : "",
            )
            .filter(Boolean)
        : [],
    );
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

    const storeNames = filterRawgStoresForShelf(
      Array.isArray(bestMatch.stores)
        ? bestMatch.stores
            .map((entry) => entry?.store?.name)
            .filter(
              (entry: unknown): entry is string => typeof entry === "string",
            )
        : [],
      platform,
    );
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
          .map((entry) => entry?.name)
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

    const tagNames = filterRawgTagsForShelf(
      [
        ...(Array.isArray(bestMatch.tags)
          ? bestMatch.tags
              .map((entry: { name?: unknown }) =>
                typeof entry?.name === "string" ? entry.name.trim() : "",
              )
              .filter(Boolean)
          : []),
        ...detailTags,
      ],
      platform,
    );
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

    const parentPlatformNames = preferResolvedRawgPlatformNames(
      Array.isArray(bestMatch.parent_platforms)
        ? bestMatch.parent_platforms
            .map((entry: { platform?: { name?: unknown } }) =>
              typeof entry?.platform?.name === "string"
                ? entry.platform.name.trim()
                : "",
            )
            .filter(Boolean)
        : [],
    );
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

    const allPlatformNames = [...platformNames, ...parentPlatformNames];
    const platformKey =
      resolveGameAttachmentPlatformKey({
        requestedPlatform: platform,
        title: bestMatch.name,
      }) ?? solePlatformKeyFromNames(allPlatformNames);

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

    if (gameplayClip) {
      facts.push({
        kind: "video",
        label: "Vidéo",
        value: gameplayClip.label,
        url: gameplayClip.url,
        source: "RAWG",
        confidence: 0.54,
        priority: 30,
      });
    }

    return withMetadataPlatformKeys(
      {
        title: bestMatch.name,
        platformKey: platformKey || undefined,
        description: detailedDescription,
        releaseDate: bestMatch.released,
        imageUrl,
        aliases: catalogAliasesFromNames(bestMatch.name, detailAliases),
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
        externalIds: { rawg: String(bestMatch.id) },
      },
      platformKey,
    );
  };
}
