import { cleanCode } from "@/lib/barcode/query";
import { inferTextLanguage } from "@/lib/locale/preference";
import {
  makeObservationUsage,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/lib/metadata/observations";
import { scoreLaunchBoxTitleMatch } from "@/services/providers/launchbox/matchScore";
import {
  fetchTheGamesDbById,
  searchTheGamesDbByName,
  type TheGamesDbBoxArt,
  type TheGamesDbSearchGame,
} from "./fetch";
import { resolveTheGamesDbPlatformId } from "./platformMap";
import { getPlatformKeyByTheGamesDbPlatformId } from "@/lib/games/platforms";
import { isPalRegionId, regionIdToAttachmentRole } from "./regions";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type {
  ImageObservationRole,
  MetadataObservation,
  ObservationEvidenceSignal,
} from "@/types/metadataObservation";

const THEGAMESDB_PROVIDER_ID = "thegamesdb";
const MIN_REGIONAL_SIBLING_SCORE = 0.55;
const MAX_REGIONAL_SIBLING_FETCHES = 4;

type TheGamesDbBoxArtBundle = {
  base_url?: Partial<Record<string, string>>;
  data?: Record<string, TheGamesDbBoxArt[]>;
};

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
    entries.find((entry) => entry.type === "boxart" && entry.side !== "back") ||
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
  boxArt: TheGamesDbBoxArtBundle | undefined,
): MetadataAttachment[] {
  const entries = boxArt?.data?.[String(gameId)] || [];
  const role = regionIdToAttachmentRole(regionId);
  const base =
    boxArt?.base_url?.original ||
    boxArt?.base_url?.large ||
    "https://cdn.thegamesdb.net/images/original/";

  return entries.flatMap((entry) => {
    if (!entry.filename) return [];
    const isBack = entry.side === "back";
    const type =
      entry.type === "boxart" ? ("cover" as const) : ("image" as const);
    return [
      {
        type,
        role: isBack ? (role ? `back-${role}` : "back") : role,
        url: `${base}${entry.filename}`,
        source: "thegamesdb",
      },
    ];
  });
}

function mergeTheGamesDbAttachments(
  bundles: Array<{
    gameId: number;
    regionId?: number | null;
    boxArt?: TheGamesDbBoxArtBundle;
  }>,
): MetadataAttachment[] {
  const seenUrls = new Set<string>();
  const merged: MetadataAttachment[] = [];

  for (const bundle of bundles) {
    for (const attachment of buildAttachments(
      bundle.gameId,
      bundle.regionId ?? undefined,
      bundle.boxArt,
    )) {
      const key = attachment.url.trim().toLowerCase();
      if (!key || seenUrls.has(key)) continue;
      seenUrls.add(key);
      merged.push(attachment);
    }
  }

  return merged;
}

function regionalAttachmentBucket(
  regionId?: number | null,
  gameId?: number,
): string {
  return regionIdToAttachmentRole(regionId) || `game-${gameId ?? "unknown"}`;
}

/** Same-platform search hits worth fetching for regional box art. */
export function pickRegionalSiblingGames(
  games: TheGamesDbSearchGame[],
  selected: TheGamesDbSearchGame,
  requestedName: string,
  platform?: string | null,
  barcode?: string | null,
  limit = MAX_REGIONAL_SIBLING_FETCHES,
): TheGamesDbSearchGame[] {
  const platformId = resolveTheGamesDbPlatformId(platform);
  const cleanedBarcode = cleanCode(barcode);
  const preferPal =
    cleanedBarcode.length === 13 && !cleanedBarcode.startsWith("0");
  const selectedPlatform = selected.platform;
  const seenRegions = new Set([regionalAttachmentBucket(selected.region_id, selected.id)]);

  const ranked = games
    .filter((game) => game.id !== selected.id)
    .filter(
      (game) =>
        selectedPlatform == null || game.platform === selectedPlatform,
    )
    .map((game) => ({
      game,
      score: scoreSearchCandidate(game, requestedName, platformId, preferPal),
    }))
    .filter((entry) => entry.score >= MIN_REGIONAL_SIBLING_SCORE)
    .sort((a, b) => b.score - a.score);

  const picked: TheGamesDbSearchGame[] = [];
  for (const { game } of ranked) {
    const bucket = regionalAttachmentBucket(game.region_id, game.id);
    if (seenRegions.has(bucket)) continue;
    seenRegions.add(bucket);
    picked.push(game);
    if (picked.length >= limit) break;
  }

  return picked;
}

function scoreSearchCandidate(
  game: TheGamesDbSearchGame,
  requestedName: string,
  platformId: number | null,
  preferPal: boolean,
): number {
  let score = scoreLaunchBoxTitleMatch(requestedName, game.game_title);

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

function normalizeTheGamesDbPlayerCount(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/\b(players?|joueurs?)\b/gi, "")
    .replace(/\s*(?:to|à)\s*/gi, "-")
    .replace(/\s*[-–—]\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const range = cleaned.match(/^(\d+)\s*-\s*(\d+)\+?$/);
  if (range) return `${range[1]}-${range[2]}`;

  const single = cleaned.match(/^(\d+)\+?$/);
  if (single) return single[1];

  return raw.replace(/\s+/g, " ");
}

function normalizeTheGamesDbCoop(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^(yes|true|1|oui)$/i.test(raw)) return "Oui";
  if (/^(no|false|0|non)$/i.test(raw)) return "Non";
  return raw.replace(/\s+/g, " ");
}

function normalizeTheGamesDbImageRegion(
  role: string | undefined,
): string | undefined {
  if (!role) return undefined;
  if (role === "back") return undefined;
  if (role.startsWith("back-")) {
    return role.slice("back-".length) || undefined;
  }
  return role;
}

function theGamesDbImageObservationRole(
  attachment: MetadataAttachment,
): ImageObservationRole {
  const role = (attachment.role || "").toLowerCase();
  if (role === "back" || role.startsWith("back-")) return "cover_back";
  if (attachment.type === "cover") return "cover_front";
  return "gallery_image";
}

function buildTheGamesDbObservations(
  metadata: MetadataResult,
  gameId: number,
  options: { hasPlatformMatch: boolean },
): MetadataObservation[] {
  const evidenceSignals: ObservationEvidenceSignal[] = ["structured_data"];
  if (options.hasPlatformMatch) {
    evidenceSignals.push("platform_match");
  }

  const factsForObservation = metadata.facts?.map((fact) => ({
    ...fact,
    source: THEGAMESDB_PROVIDER_ID,
  }));
  const observations = observationsFromMetadataResult(
    {
      ...metadata,
      imageUrl: undefined,
      attachments: undefined,
      facts: factsForObservation,
    },
    {
      providerId: THEGAMESDB_PROVIDER_ID,
      providerLabel: "TheGamesDB",
      sourceDocumentRole: "reference_record",
      sourceUrl: `https://thegamesdb.net/game.php?id=${gameId}`,
      evidenceSignals,
      titleRole: "object_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      externalIdRole: "provider_record_id",
      language: metadata.title ? inferTextLanguage(metadata.title) : "unknown",
    },
  );

  const seenImageUrls = new Set<string>();
  const imageCandidates: MetadataAttachment[] = [
    ...(metadata.imageUrl
      ? [
          {
            type: "cover",
            url: metadata.imageUrl,
            source: THEGAMESDB_PROVIDER_ID,
          } satisfies MetadataAttachment,
        ]
      : []),
    ...(metadata.attachments || []),
  ];

  for (const attachment of imageCandidates) {
    const url = attachment.url?.trim();
    if (!url || seenImageUrls.has(url)) continue;
    seenImageUrls.add(url);

    const role = theGamesDbImageObservationRole(attachment);
    observations.push({
      kind: "image",
      role,
      type: attachment.type,
      url,
      title: attachment.title ?? null,
      region: normalizeTheGamesDbImageRegion(attachment.role) ?? null,
      provenance: {
        providerId: THEGAMESDB_PROVIDER_ID,
        providerLabel: "TheGamesDB",
        sourceDocumentRole: "reference_record",
        sourceUrl: `https://thegamesdb.net/game.php?id=${gameId}`,
        evidenceSignals,
      },
      usage: makeObservationUsage({
        displayCandidate: true,
        evidence:
          role === "cover_front" || role === "cover_back" ? "strong" : "normal",
      }),
    });
  }

  return observations;
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
  const requestedPlatformId = resolveTheGamesDbPlatformId(platform);

  const details = await fetchTheGamesDbById(selected.id);
  const game = details?.data?.games?.[0];
  if (!game) return null;

  const regionalSiblings = pickRegionalSiblingGames(
    games,
    selected,
    name,
    platform,
    barcode,
  );
  const siblingDetails = await Promise.all(
    regionalSiblings.map((sibling) => fetchTheGamesDbById(sibling.id)),
  );

  const title = game.game_title?.trim() || selected.game_title?.trim();
  if (!title) return null;

  const overview =
    game.overview?.trim() ||
    details?.include?.overview?.data?.[String(game.id)]?.overview?.trim();
  const imageUrl = pickFrontBoxArtUrl(game.id, details?.include?.boxart);
  const attachmentBundles = [
    {
      gameId: game.id,
      regionId: game.region_id ?? selected.region_id,
      boxArt: details?.include?.boxart,
    },
    ...regionalSiblings.flatMap((sibling, index) => {
      const siblingResponse = siblingDetails[index];
      const siblingGame = siblingResponse?.data?.games?.[0];
      const boxArt = siblingResponse?.include?.boxart;
      const entries = boxArt?.data?.[String(sibling.id)] || [];
      if (entries.length === 0) return [];
      return [
        {
          gameId: sibling.id,
          regionId: siblingGame?.region_id ?? sibling.region_id,
          boxArt,
        },
      ];
    }),
  ];
  const attachments = mergeTheGamesDbAttachments(attachmentBundles);
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

  const players = normalizeTheGamesDbPlayerCount(game.players);
  if (players) {
    facts.push({
      kind: "players",
      label: "Joueurs",
      value: players,
      source: "thegamesdb",
      confidence: 0.6,
      priority: 38,
    });
  }

  const cooperative = normalizeTheGamesDbCoop(game.coop);
  if (cooperative) {
    facts.push({
      kind: "cooperative",
      label: "Coop",
      value: cooperative,
      source: "thegamesdb",
      confidence: 0.58,
      priority: 34,
    });
  }

  const result: MetadataResult = {
    title,
    platformKey:
      getPlatformKeyByTheGamesDbPlatformId(game.platform) ||
      getPlatformKeyByTheGamesDbPlatformId(selected.platform) ||
      undefined,
    description: overview || undefined,
    releaseDate: game.release_date || selected.release_date,
    imageUrl,
    attachments: attachments.length > 0 ? attachments : undefined,
    publishers: publishers?.length ? publishers : undefined,
    aliases: aliases.length > 0 ? Array.from(new Set(aliases)) : undefined,
    regionalTitles: regionalTitles.length > 0 ? regionalTitles : undefined,
    facts: facts.length > 0 ? facts : undefined,
    externalIds: { thegamesdb: String(game.id || selected.id) },
  };
  return {
    ...result,
    observations: buildTheGamesDbObservations(result, game.id || selected.id, {
      hasPlatformMatch:
        requestedPlatformId != null &&
        (selected.platform === requestedPlatformId ||
          game.platform === requestedPlatformId),
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}
