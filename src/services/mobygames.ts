import axios from "axios";
import levenshtein from "fast-levenshtein";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "./metadata";

const MOBYGAMES_API_BASE = "https://api.mobygames.com/v1";
const REQUEST_TIMEOUT_MS = 8000;

interface MobyAlternateTitle {
  description?: string | null;
  title?: string | null;
}

interface MobyPlatform {
  first_release_date?: string | null;
  platform_id: number;
  platform_name: string;
}

interface MobyGenre {
  genre_category?: string | null;
  genre_name?: string | null;
}

interface MobyGame {
  alternate_titles?: MobyAlternateTitle[] | null;
  description?: string | null;
  game_id: number;
  genres?: MobyGenre[] | null;
  moby_score?: number | null;
  moby_url?: string | null;
  num_votes?: number | null;
  official_url?: string | null;
  platforms?: MobyPlatform[] | null;
  sample_cover?: MobyImage | null;
  sample_screenshots?: MobyImage[] | null;
  title?: string | null;
}

interface MobyGamesSearchResponse {
  games?: MobyGame[] | null;
}

interface MobyCompany {
  company_name?: string | null;
  role?: string | null;
}

interface MobyRelease {
  companies?: MobyCompany[] | null;
  countries?: string[] | null;
  release_date?: string | null;
}

interface MobyAttribute {
  attribute_category_name?: string | null;
  attribute_name?: string | null;
}

interface MobyRating {
  rating_system_name?: string | null;
  rating_name?: string | null;
}

interface MobyPlatformDetail {
  attributes?: MobyAttribute[] | null;
  first_release_date?: string | null;
  platform_id?: number | null;
  platform_name?: string | null;
  ratings?: MobyRating[] | null;
  releases?: MobyRelease[] | null;
}

interface MobyImage {
  caption?: string | null;
  comments?: string | null;
  description?: string | null;
  height?: number | null;
  image?: string | null;
  platforms?: string[] | null;
  scan_of?: string | null;
  thumbnail_image?: string | null;
  width?: number | null;
}

interface MobyCoverGroup {
  comments?: string | null;
  countries?: string[] | null;
  covers?: MobyImage[] | null;
}

interface MobyCoversResponse {
  cover_groups?: MobyCoverGroup[] | null;
}

interface MobyScreenshotsResponse {
  screenshots?: MobyImage[] | null;
}

function getMobyGamesApiKey() {
  return process.env.MOBYGAMES_API_KEY?.trim() || "";
}

async function fetchMobyGamesJson<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T | null> {
  const apiKey = getMobyGamesApiKey();
  if (!apiKey) return null;

  const res = await axios.get<T>(`${MOBYGAMES_API_BASE}${path}`, {
    params: {
      ...params,
      api_key: apiKey,
    },
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: (status) => status >= 200 && status < 300,
  });

  return res.data;
}

function normalizeForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textSimilarity(a: string, b: string): number {
  const normalizedA = normalizeForComparison(a);
  const normalizedB = normalizeForComparison(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return 0.88;
  }

  const aTokens = new Set(normalizedA.split(/\s+/));
  const bTokens = new Set(normalizedB.split(/\s+/));
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  const tokenScore = shared / Math.max(aTokens.size, bTokens.size);
  const distanceScore =
    1 -
    levenshtein.get(normalizedA, normalizedB) /
      Math.max(normalizedA.length, normalizedB.length);

  return Math.max(tokenScore, distanceScore);
}

function platformAliases(value?: string | null): string[] {
  if (!value) return [];
  const normalized = normalizeForComparison(value)
    .replace(/\bnintendo entertainment system\b/g, "nes")
    .replace(/\bsuper nintendo entertainment system\b/g, "super nintendo")
    .replace(/\bnintendo 64\b/g, "n64")
    .replace(/\bnintendo gamecube\b/g, "gamecube")
    .replace(/\bplaystation portable\b/g, "psp")
    .replace(/\bplaystation vita\b/g, "ps vita")
    .replace(/\bplaystation\b/g, "ps")
    .replace(/\bxbox original\b/g, "xbox")
    .replace(/\boriginal xbox\b/g, "xbox")
    .replace(/\bxbox360\b/g, "xbox 360")
    .replace(/\bmega drive\b/g, "genesis")
    .replace(/\bsega genesis\b/g, "genesis")
    .replace(/\bsega master system\b/g, "master system");

  const aliases = new Set([normalized]);

  if (/\bps\s?1\b|\bpsx\b|\bps one\b/.test(normalized)) {
    aliases.add("ps");
    aliases.add("playstation");
  }
  if (/\bps\s?2\b/.test(normalized)) aliases.add("ps 2");
  if (/\bps\s?3\b/.test(normalized)) aliases.add("ps 3");
  if (/\bps\s?4\b/.test(normalized)) aliases.add("ps 4");
  if (/\bps\s?5\b/.test(normalized)) aliases.add("ps 5");
  if (/\bxbox\s?360\b|\bx360\b/.test(normalized)) aliases.add("xbox 360");
  if (/\bxbox\s?one\b|\bxone\b/.test(normalized)) aliases.add("xbox one");
  if (/\bxbox\s?series\b/.test(normalized)) aliases.add("xbox series");
  if (/\bnes\b/.test(normalized)) aliases.add("nintendo entertainment system");
  if (/\bsnes\b|\bsuper nintendo\b/.test(normalized)) {
    aliases.add("snes");
    aliases.add("super nintendo");
  }

  return [...aliases].filter(Boolean);
}

function platformMatchScore(
  candidatePlatform: string,
  requestedPlatform?: string | null,
): number {
  const requestedAliases = platformAliases(requestedPlatform);
  if (requestedAliases.length === 0) return 0.15;

  const candidateAliases = platformAliases(candidatePlatform);
  for (const candidate of candidateAliases) {
    if (requestedAliases.includes(candidate)) return 1;
  }

  for (const candidate of candidateAliases) {
    for (const requested of requestedAliases) {
      if (
        candidate.length > 3 &&
        requested.length > 3 &&
        (candidate.includes(requested) || requested.includes(candidate))
      ) {
        return 0.72;
      }
    }
  }

  return 0;
}

function titleCandidates(game: MobyGame): string[] {
  return [
    game.title,
    ...(game.alternate_titles || []).map((title) => title.title),
  ].filter((value): value is string => Boolean(value?.trim()));
}

function bestTitleScore(game: MobyGame, requestedName: string) {
  return titleCandidates(game).reduce(
    (best, title) => Math.max(best, textSimilarity(title, requestedName)),
    0,
  );
}

function bestPlatformScore(game: MobyGame, platform?: string | null) {
  const platforms = game.platforms || [];
  if (platforms.length === 0) return 0;
  return platforms.reduce(
    (best, candidate) =>
      Math.max(best, platformMatchScore(candidate.platform_name, platform)),
    0,
  );
}

function pickBestGame(
  games: MobyGame[],
  requestedName: string,
  platform?: string | null,
): MobyGame | null {
  if (games.length === 0) return null;

  const scored = games
    .map((game) => {
      const titleScore = bestTitleScore(game, requestedName);
      const platformScore = bestPlatformScore(game, platform);
      const score = titleScore * 0.78 + platformScore * 0.22;
      return { game, score, titleScore, platformScore };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.titleScore < 0.5) return null;
  if (platform && best.platformScore === 0 && best.titleScore < 0.8) return null;
  return best.game;
}

function pickBestPlatform(
  platforms: MobyPlatform[],
  requestedPlatform?: string | null,
): MobyPlatform | null {
  if (platforms.length === 0) return null;

  return [...platforms].sort(
    (a, b) =>
      platformMatchScore(b.platform_name, requestedPlatform) -
        platformMatchScore(a.platform_name, requestedPlatform) ||
      (a.first_release_date || "").localeCompare(b.first_release_date || ""),
  )[0];
}

function normalizeImageUrl(url?: string | null): string | null {
  if (!url) return null;
  return url.replace(
    /^http:\/\/www\.mobygames\.com/i,
    "https://www.mobygames.com",
  );
}

function cleanRole(value?: string | null): string | undefined {
  if (!value) return undefined;
  return normalizeForComparison(value).replace(/\s+/g, "-") || undefined;
}

function formatCountries(countries?: string[] | null): string | null {
  if (!countries || countries.length === 0) return null;
  return countries.slice(0, 3).join(", ");
}

function coverPriority(cover: MobyImage): number {
  const scanOf = normalizeForComparison(
    cover.scan_of || cover.description || "",
  );
  if (scanOf.includes("front")) return 1;
  if (scanOf.includes("media")) return 2;
  if (scanOf.includes("back")) return 3;
  return 4;
}

function buildCoverAttachments(
  coverGroups?: MobyCoverGroup[] | null,
): MetadataAttachment[] {
  if (!coverGroups) return [];

  return coverGroups
    .flatMap((group) =>
      (group.covers || []).map((cover) => ({
        cover,
        countries: formatCountries(group.countries),
      })),
    )
    .sort((a, b) => coverPriority(a.cover) - coverPriority(b.cover))
    .flatMap(({ cover, countries }) => {
      const url = normalizeImageUrl(cover.image || cover.thumbnail_image);
      if (!url) return [];

      const scanOf = cover.scan_of || cover.description || "Cover";
      const countrySuffix = countries ? ` (${countries})` : "";
      return [
        {
          type: "cover",
          title: `MobyGames - ${scanOf}${countrySuffix}`,
          url,
          role: cleanRole(scanOf),
          source: "mobygames",
        } satisfies MetadataAttachment,
      ];
    });
}

function buildScreenshotAttachments(
  screenshots?: MobyImage[] | null,
): MetadataAttachment[] {
  if (!screenshots) return [];
  return screenshots.slice(0, 8).flatMap((screenshot) => {
    const url = normalizeImageUrl(screenshot.image || screenshot.thumbnail_image);
    if (!url) return [];
    return [
      {
        type: "screenshot",
        title: screenshot.caption || undefined,
        url,
        source: "mobygames",
      } satisfies MetadataAttachment,
    ];
  });
}

function buildSampleCoverAttachment(game: MobyGame): MetadataAttachment[] {
  const url = normalizeImageUrl(
    game.sample_cover?.image || game.sample_cover?.thumbnail_image,
  );
  if (!url) return [];
  return [
    {
      type: "cover",
      title: "MobyGames - Sample cover",
      url,
      role: "sample-cover",
      source: "mobygames",
    },
  ];
}

function buildPublishers(detail: MobyPlatformDetail | null) {
  const publishers =
    detail?.releases
      ?.flatMap((release) => release.companies || [])
      .filter((company) => /publish/i.test(company.role || ""))
      .map((company) => company.company_name?.trim())
      .filter((name): name is string => Boolean(name)) || [];

  return Array.from(new Set(publishers)).map((name) => ({ name }));
}

function buildFacts(
  game: MobyGame,
  detail: MobyPlatformDetail | null,
): MetadataFact[] {
  const facts: MetadataFact[] = [];

  if (typeof game.moby_score === "number" && game.moby_score > 0) {
    facts.push({
      kind: "rating",
      label: "MobyGames",
      value: `${game.moby_score.toLocaleString("fr-FR", {
        maximumFractionDigits: 1,
      })}/5`,
      url: game.moby_url || undefined,
      source: "mobygames",
      confidence: game.num_votes && game.num_votes > 5 ? 0.78 : 0.68,
      priority: 73,
    });
  }

  if (game.moby_url) {
    facts.push({
      kind: "external-link",
      label: "MobyGames",
      value: "Fiche MobyGames",
      url: game.moby_url,
      source: "mobygames",
      confidence: 0.88,
      priority: 44,
    });
  }

  const pegi = detail?.ratings?.find((rating) =>
    /pegi/i.test(rating.rating_system_name || ""),
  );
  if (pegi?.rating_name) {
    facts.push({
      kind: "age-rating",
      label: "PEGI",
      value: pegi.rating_name.replace(/^PEGI\s*/i, "").trim(),
      source: "mobygames",
      confidence: 0.78,
      priority: 90,
    });
  }

  const playerCount = detail?.attributes?.find((attribute) =>
    /number of players/i.test(attribute.attribute_category_name || ""),
  )?.attribute_name;
  if (playerCount) {
    facts.push({
      kind: "players",
      label: "Joueurs",
      value: playerCount,
      source: "mobygames",
      confidence: 0.72,
      priority: 44,
    });
  }

  return facts;
}

function buildAliases(game: MobyGame): string[] {
  const title = game.title?.trim().toLowerCase();
  return Array.from(
    new Set(
      (game.alternate_titles || [])
        .map((item) => item.title?.trim())
        .filter((value): value is string => Boolean(value))
        .filter((value) => value.toLowerCase() !== title),
    ),
  );
}

export async function fetchFromMobyGames(
  name: string,
  platform?: string | null,
): Promise<MetadataResult | null> {
  if (!getMobyGamesApiKey()) return null;

  try {
    const search = await fetchMobyGamesJson<MobyGamesSearchResponse>("/games", {
      title: name,
      format: "normal",
      limit: 10,
    });
    const games = search?.games || [];
    const game = pickBestGame(games, name, platform);
    if (!game?.game_id) return null;

    const selectedPlatform = pickBestPlatform(game.platforms || [], platform);
    const [detailResult, coversResult, screenshotsResult] =
      await Promise.allSettled([
        selectedPlatform
          ? fetchMobyGamesJson<MobyPlatformDetail>(
              `/games/${game.game_id}/platforms/${selectedPlatform.platform_id}`,
            )
          : Promise.resolve(null),
        selectedPlatform
          ? fetchMobyGamesJson<MobyCoversResponse>(
              `/games/${game.game_id}/platforms/${selectedPlatform.platform_id}/covers`,
            )
          : Promise.resolve(null),
        selectedPlatform
          ? fetchMobyGamesJson<MobyScreenshotsResponse>(
              `/games/${game.game_id}/platforms/${selectedPlatform.platform_id}/screenshots`,
            )
          : Promise.resolve(null),
      ]);

    const detail =
      detailResult.status === "fulfilled" ? detailResult.value : null;
    const covers =
      coversResult.status === "fulfilled" ? coversResult.value : null;
    const screenshots =
      screenshotsResult.status === "fulfilled" ? screenshotsResult.value : null;

    const coverAttachments = buildCoverAttachments(covers?.cover_groups);
    const sampleCoverAttachments = buildSampleCoverAttachment(game);
    const sampleScreenshots = buildScreenshotAttachments(game.sample_screenshots);
    const platformScreenshots = buildScreenshotAttachments(
      screenshots?.screenshots,
    );
    const attachments = [
      ...coverAttachments,
      ...sampleCoverAttachments,
      ...platformScreenshots,
      ...sampleScreenshots,
    ];
    const imageUrl =
      coverAttachments[0]?.url ||
      sampleCoverAttachments[0]?.url ||
      platformScreenshots[0]?.url ||
      sampleScreenshots[0]?.url;
    const publishers = buildPublishers(detail);
    const aliases = buildAliases(game);
    const facts = buildFacts(game, detail);

    return {
      title: game.title || undefined,
      description: game.description || undefined,
      releaseDate:
        detail?.first_release_date ||
        selectedPlatform?.first_release_date ||
        undefined,
      imageUrl,
      attachments: attachments.length > 0 ? attachments : undefined,
      publishers: publishers.length > 0 ? publishers : undefined,
      aliases: aliases.length > 0 ? aliases : undefined,
      facts: facts.length > 0 ? facts : undefined,
    };
  } catch (error) {
    console.error(
      `[MobyGames] Error fetching metadata for "${name}": ${
        error instanceof Error ? error.message : error
      }`,
    );
    return null;
  }
}

export async function pingMobyGames() {
  const start = Date.now();
  if (!getMobyGamesApiKey()) {
    return { ok: false, latency: null, error: "MOBYGAMES_API_KEY missing" };
  }

  try {
    await fetchMobyGamesJson<MobyGamesSearchResponse>("/games", {
      title: "Hades",
      format: "brief",
      limit: 1,
    });
    return { ok: true, latency: Date.now() - start, error: null };
  } catch (error) {
    return {
      ok: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "MobyGames unreachable",
    };
  }
}
