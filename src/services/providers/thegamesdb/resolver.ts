import { cleanCode } from "@/lib/barcode/query";
import { metadataTitleSimilarity } from "@/lib/metadataTitleSimilarity";
import { inferTextLanguage } from "@/lib/localePreference";
import {
  fetchTheGamesDbById,
  searchTheGamesDbByName,
  type TheGamesDbBoxArt,
  type TheGamesDbSearchGame,
} from "./fetch";
import { resolveTheGamesDbPlatformId } from "./platformMap";
import { isPalRegionId, regionIdToAttachmentRole } from "./regions";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

function pickFrontBoxArtUrl(
  gameId: number,
  boxArt:
    | {
        base_url?: Partial<Record<string, string>>;
        data?: Record<string, TheGamesDbBoxArt[]>;
      }
    | undefined,
): string | undefined {
  const entries = boxArt?.data?.[String(gameId)] || [];
  const front =
    entries.find((entry) => entry.side === "front") ||
    entries.find((entry) => entry.type === "boxart") ||
    entries[0];
  if (!front?.filename) return undefined;

  const base =
    boxArt?.base_url?.original ||
    boxArt?.base_url?.large ||
    boxArt?.base_url?.medium ||
    "https://cdn.thegamesdb.net/images/original/";
  return `${base}${front.filename}`;
}

function buildAttachments(
  gameId: number,
  regionId: number | undefined,
  boxArt:
    | {
        base_url?: Partial<Record<string, string>>;
        data?: Record<string, TheGamesDbBoxArt[]>;
      }
    | undefined,
): MetadataAttachment[] {
  const entries = boxArt?.data?.[String(gameId)] || [];
  const role = regionIdToAttachmentRole(regionId);
  const base =
    boxArt?.base_url?.original ||
    boxArt?.base_url?.large ||
    "https://cdn.thegamesdb.net/images/original/";

  return entries.flatMap((entry) => {
    if (!entry.filename) return [];
    const type =
      entry.type === "boxart"
        ? ("cover" as const)
        : entry.side === "back"
          ? ("image" as const)
          : ("image" as const);
    return [
      {
        type,
        role:
          type === "cover"
            ? role
            : entry.side === "back"
              ? role
                ? `back-${role}`
                : "back"
              : role,
        url: `${base}${entry.filename}`,
        source: "thegamesdb",
      },
    ];
  });
}

function scoreSearchCandidate(
  game: TheGamesDbSearchGame,
  requestedName: string,
  platformId: number | null,
  preferPal: boolean,
): number {
  let score = metadataTitleSimilarity(requestedName, game.game_title);

  if (platformId != null && game.platform === platformId) {
    score += 0.28;
  }

  if (preferPal && isPalRegionId(game.region_id)) {
    score += 0.18;
  } else if (!preferPal && (game.region_id === 1 || game.region_id === 2)) {
    score += 0.08;
  }

  if (inferTextLanguage(requestedName) === "fr") {
    if (inferTextLanguage(game.game_title) === "fr") {
      score += 0.12;
    }
  }

  return score;
}

function pickBestSearchCandidate(
  games: TheGamesDbSearchGame[],
  requestedName: string,
  platform?: string | null,
  barcode?: string | null,
): TheGamesDbSearchGame | null {
  if (games.length === 0) return null;

  const platformId = resolveTheGamesDbPlatformId(platform);
  const cleanedBarcode = cleanCode(barcode);
  const preferPal =
    cleanedBarcode.length === 13 && !cleanedBarcode.startsWith("0");

  return games
    .slice()
    .sort(
      (a, b) =>
        scoreSearchCandidate(b, requestedName, platformId, preferPal) -
        scoreSearchCandidate(a, requestedName, platformId, preferPal),
    )[0];
}

function buildRegionalTitles(
  games: TheGamesDbSearchGame[],
  selectedId: number,
): { region?: string; text: string }[] {
  const selectedPlatform = games.find(
    (game) => game.id === selectedId,
  )?.platform;
  const related = games.filter(
    (game) =>
      game.id !== selectedId &&
      (selectedPlatform == null || game.platform === selectedPlatform),
  );

  return related
    .filter((game) => game.game_title?.trim())
    .map((game) => ({
      region: regionIdToAttachmentRole(game.region_id),
      text: game.game_title.trim(),
    }));
}

export async function fetchFromTheGamesDB(
  name: string,
  platform?: string | null,
  barcode?: string | null,
): Promise<MetadataResult | null> {
  const search = await searchTheGamesDbByName(name);
  const games = search?.data?.games || [];
  const selected = pickBestSearchCandidate(games, name, platform, barcode);
  if (!selected) return null;

  const details = await fetchTheGamesDbById(selected.id);
  const game = details?.data?.games?.[0];
  if (!game) return null;

  const title = game.game_title?.trim() || selected.game_title?.trim();
  if (!title) return null;

  const overview =
    game.overview?.trim() ||
    details?.include?.overview?.data?.[String(game.id)]?.overview?.trim();
  const imageUrl = pickFrontBoxArtUrl(game.id, details?.include?.boxart);
  const attachments = buildAttachments(
    game.id,
    game.region_id ?? selected.region_id,
    details?.include?.boxart,
  );
  const regionalTitles = buildRegionalTitles(games, game.id);
  const aliases = regionalTitles
    .map((entry) => entry.text)
    .filter((value) => value.toLowerCase() !== title.toLowerCase());

  const publishers = details?.include?.publishers?.data
    ? Object.values(details.include.publishers.data)
        .map((entry) => entry.name?.trim())
        .filter(Boolean)
        .map((publisherName) => ({ name: publisherName }))
    : undefined;

  const facts: MetadataFact[] = [];
  const genres = details?.include?.genres?.data
    ? Object.values(details.include.genres.data)
        .map((entry) => entry.name?.trim())
        .filter(Boolean)
    : [];
  if (genres.length > 0) {
    facts.push({
      kind: "genre",
      label: "Genres",
      value: genres.slice(0, 5).join(" • "),
      source: "TheGamesDB",
      confidence: 0.64,
      priority: 42,
    });
  }

  const developers = details?.include?.developers?.data
    ? Object.values(details.include.developers.data)
        .map((entry) => entry.name?.trim())
        .filter(Boolean)
    : [];
  if (developers.length > 0) {
    facts.push({
      kind: "developer",
      label: "Développeur",
      value: developers.slice(0, 3).join(" • "),
      source: "TheGamesDB",
      confidence: 0.66,
      priority: 46,
    });
  }

  return {
    title,
    description: overview || undefined,
    releaseDate: game.release_date || selected.release_date,
    imageUrl,
    attachments: attachments.length > 0 ? attachments : undefined,
    publishers: publishers?.length ? publishers : undefined,
    aliases: aliases.length > 0 ? Array.from(new Set(aliases)) : undefined,
    regionalTitles: regionalTitles.length > 0 ? regionalTitles : undefined,
    facts: facts.length > 0 ? facts : undefined,
  };
}
