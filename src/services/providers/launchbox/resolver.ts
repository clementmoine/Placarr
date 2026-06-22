import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

import {
  buildLaunchBoxAttachments,
  pickLaunchBoxCoverUrl,
} from "./images";
import {
  ensureLaunchBoxIndex,
  isLaunchBoxEnabled,
} from "./indexStore";
import {
  decodeLaunchBoxTitle,
  minimumLaunchBoxMatchScore,
  scoreLaunchBoxTitleMatch,
} from "./matchScore";
import type {
  LaunchBoxAlternateNameRecord,
  LaunchBoxGameRecord,
  LaunchBoxImageRecord,
} from "./parse";

const LAUNCHBOX_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "de",
  "des",
  "du",
  "for",
  "in",
  "la",
  "le",
  "les",
  "of",
  "on",
  "or",
  "the",
  "to",
  "un",
  "une",
  "vs",
]);

export function tokenizeLaunchBoxQuery(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u0027\u0060\u00B4\u2018\u2019\u201B\u2032]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 0 &&
        (token.length > 1 || /^\d+$/.test(token)) &&
        !LAUNCHBOX_STOP_WORDS.has(token),
    );
}

function ftsPrefixToken(token: string): string | null {
  const safe = token.replace(/[^a-z0-9]/g, "");
  return safe ? `${safe}*` : null;
}

export function buildLaunchBoxFtsQueries(tokens: string[]): string[] {
  const prefixes = tokens
    .map(ftsPrefixToken)
    .filter((token): token is string => token !== null);

  if (prefixes.length === 0) return [];
  if (prefixes.length === 1) return [prefixes[0]];

  const queries: string[] = [prefixes.join(" AND ")];

  const byLength = [...tokens].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  );

  for (let drop = 1; drop < tokens.length - 1; drop++) {
    const relaxed = byLength
      .slice(0, tokens.length - drop)
      .map(ftsPrefixToken)
      .filter((token): token is string => token !== null)
      .join(" AND ");
    if (relaxed && !queries.includes(relaxed)) {
      queries.push(relaxed);
    }
  }

  const longest = ftsPrefixToken(byLength[0]);
  if (longest && !queries.includes(longest)) {
    queries.push(longest);
  }

  return queries;
}

function candidateNames(game: LaunchBoxGameRecord): string[] {
  return [
    game.name,
    ...game.alternateNames.map((alternate) => alternate.name),
  ];
}

function scoreLaunchBoxCandidate(
  game: LaunchBoxGameRecord,
  requestedName: string,
  platform?: string | null,
): number {
  return candidateNames(game).reduce(
    (best, candidate) =>
      Math.max(
        best,
        scoreLaunchBoxTitleMatch(
          requestedName,
          candidate,
          platform,
          game.platform,
        ),
      ),
    0,
  );
}

export function pickBestLaunchBoxGame(
  games: LaunchBoxGameRecord[],
  requestedName: string,
  platform?: string | null,
  minScore = minimumLaunchBoxMatchScore(requestedName),
): LaunchBoxGameRecord | null {
  let best: LaunchBoxGameRecord | null = null;
  let bestScore = minScore;

  for (const game of games) {
    const score = scoreLaunchBoxCandidate(game, requestedName, platform);
    if (score > bestScore) {
      bestScore = score;
      best = game;
    }
  }

  return best;
}

function formatReleaseDate(game: LaunchBoxGameRecord): string | undefined {
  if (game.releaseDate) {
    return game.releaseDate.split("T")[0];
  }
  if (game.releaseYear) return game.releaseYear;
  return undefined;
}

export function mapLaunchBoxGameToMetadata(
  game: LaunchBoxGameRecord,
): MetadataResult {
  const facts: MetadataFact[] = [];

  if (game.esrb) {
    facts.push({
      kind: "age-rating",
      label: "ESRB",
      value: game.esrb,
      source: "launchbox",
      confidence: 0.58,
      priority: 48,
    });
  }

  if (game.communityRating && Number.isFinite(game.communityRating)) {
    const ratingLabel =
      game.communityRatingCount && game.communityRatingCount > 0
        ? `LaunchBox (${game.communityRatingCount} votes)`
        : "LaunchBox";
    facts.push({
      kind: "rating",
      label: ratingLabel,
      value: `${game.communityRating.toFixed(1)}/5`,
      source: "launchbox",
      confidence: 0.62,
      priority: 52,
    });
  }

  if (game.genres?.length) {
    facts.push({
      kind: "genre",
      label: "Genres",
      value: game.genres.slice(0, 5).join(" • "),
      source: "launchbox",
      confidence: 0.6,
      priority: 40,
    });
  }

  if (game.developer) {
    facts.push({
      kind: "developer",
      label: "Développeur",
      value: game.developer,
      source: "launchbox",
      confidence: 0.64,
      priority: 44,
    });
  }

  if (game.maxPlayers && game.maxPlayers > 0) {
    facts.push({
      kind: "players",
      label: "Joueurs max",
      value: String(game.maxPlayers),
      source: "launchbox",
      confidence: 0.56,
      priority: 36,
    });
  }

  if (game.releaseType) {
    facts.push({
      kind: "release-type",
      label: "Statut",
      value: game.releaseType,
      source: "launchbox",
      confidence: 0.5,
      priority: 30,
    });
  }

  if (game.cooperative != null) {
    facts.push({
      kind: "cooperative",
      label: "Coop",
      value: game.cooperative ? "Oui" : "Non",
      source: "launchbox",
      confidence: 0.5,
      priority: 28,
    });
  }

  if (game.wikipediaUrl) {
    facts.push({
      kind: "link",
      label: "Wikipedia",
      value: "Wikipedia",
      url: game.wikipediaUrl,
      source: "launchbox",
      confidence: 0.55,
      priority: 34,
    });
  }

  if (game.videoUrl) {
    facts.push({
      kind: "video",
      label: "Vidéo",
      value: "Bande-annonce",
      url: game.videoUrl,
      source: "launchbox",
      confidence: 0.52,
      priority: 32,
    });
  }

  const decodedTitle = decodeLaunchBoxTitle(game.name);
  const aliases = Array.from(
    new Set(
      game.alternateNames
        .map((alternate) => decodeLaunchBoxTitle(alternate.name))
        .filter(Boolean),
    ),
  ).filter(
    (alias) => alias.toLowerCase().trim() !== decodedTitle.toLowerCase().trim(),
  );

  const regionalTitles = game.alternateNames
    .map((alternate) => ({
      region: alternate.region,
      text: decodeLaunchBoxTitle(alternate.name),
    }))
    .filter(
      (entry) =>
        entry.text.toLowerCase().trim() !== decodedTitle.toLowerCase().trim(),
    );

  const attachments = buildLaunchBoxAttachments(game.images);
  const imageUrl = pickLaunchBoxCoverUrl(game.images);

  return {
    title: decodedTitle,
    description: game.overview,
    releaseDate: formatReleaseDate(game),
    imageUrl,
    publishers: game.publisher
      ? [{ name: decodeLaunchBoxTitle(game.publisher) }]
      : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    aliases: aliases.length > 0 ? aliases : undefined,
    regionalTitles: regionalTitles.length > 0 ? regionalTitles : undefined,
    facts: facts.length > 0 ? facts : undefined,
    externalIds: { launchbox: String(game.databaseId) },
  };
}

function hydrateLaunchBoxGame(
  row: Record<string, unknown>,
  alternateNames: LaunchBoxAlternateNameRecord[],
  images: LaunchBoxImageRecord[],
): LaunchBoxGameRecord {
  return {
    databaseId: Number(row.databaseId),
    name: String(row.name),
    platform: String(row.platform),
    overview: row.overview ? String(row.overview) : undefined,
    releaseDate: row.releaseDate ? String(row.releaseDate) : undefined,
    releaseYear: row.releaseYear ? String(row.releaseYear) : undefined,
    developer: row.developer ? String(row.developer) : undefined,
    publisher: row.publisher ? String(row.publisher) : undefined,
    genres: row.genres ? JSON.parse(String(row.genres)) : undefined,
    esrb: row.esrb ? String(row.esrb) : undefined,
    communityRating:
      row.communityRating != null ? Number(row.communityRating) : undefined,
    communityRatingCount:
      row.communityRatingCount != null
        ? Number(row.communityRatingCount)
        : undefined,
    maxPlayers: row.maxPlayers != null ? Number(row.maxPlayers) : undefined,
    releaseType: row.releaseType ? String(row.releaseType) : undefined,
    cooperative:
      row.cooperative == null ? undefined : Number(row.cooperative) === 1,
    videoUrl: row.videoUrl ? String(row.videoUrl) : undefined,
    wikipediaUrl: row.wikipediaUrl ? String(row.wikipediaUrl) : undefined,
    alternateNames,
    images,
  };
}

export async function fetchFromLaunchBox(
  name: string,
  platform?: string | null,
): Promise<MetadataResult | null> {
  if (!isLaunchBoxEnabled()) return null;

  const db = await ensureLaunchBoxIndex();
  if (!db) {
    console.info(
      "[LaunchBox] Index unavailable — set LAUNCHBOX_ENABLED=true or LAUNCHBOX_METADATA_XML to build it",
    );
    return null;
  }

  const tokens = tokenizeLaunchBoxQuery(name);
  const ftsQueries = buildLaunchBoxFtsQueries(tokens);
  if (ftsQueries.length === 0) return null;

  const candidateIdSet = new Set<number>();

  try {
    const stmtFts = db.prepare(`
      SELECT databaseId FROM games_fts 
      WHERE games_fts MATCH ? 
      LIMIT 200
    `);

    for (const ftsQuery of ftsQueries) {
      const rows = stmtFts.all(ftsQuery) as { databaseId: number }[];
      if (rows.length === 0) continue;
      for (const row of rows) {
        candidateIdSet.add(row.databaseId);
      }
      break;
    }
  } catch (error) {
    console.error("[LaunchBox] FTS query failed", error);
  }

  const candidateIds = [...candidateIdSet];
  if (candidateIds.length === 0) return null;

  const games: LaunchBoxGameRecord[] = [];
  try {
    const placeholders = candidateIds.map(() => "?").join(",");
    const stmtGames = db.prepare(`
      SELECT * FROM games WHERE databaseId IN (${placeholders})
    `);
    const dbGames = stmtGames.all(...candidateIds) as Record<string, unknown>[];

    const stmtAlts = db.prepare(`
      SELECT gameId, name, region FROM alternate_names WHERE gameId IN (${placeholders})
    `);
    const dbAlts = stmtAlts.all(...candidateIds) as {
      gameId: number;
      name: string;
      region: string | null;
    }[];

    const stmtImages = db.prepare(`
      SELECT gameId, fileName, type, region FROM game_images WHERE gameId IN (${placeholders})
    `);
    const dbImages = stmtImages.all(...candidateIds) as {
      gameId: number;
      fileName: string;
      type: string;
      region: string | null;
    }[];

    const altsMap = new Map<number, LaunchBoxAlternateNameRecord[]>();
    for (const alt of dbAlts) {
      const list = altsMap.get(alt.gameId) || [];
      list.push({
        databaseId: alt.gameId,
        name: alt.name,
        region: alt.region || undefined,
      });
      altsMap.set(alt.gameId, list);
    }

    const imagesMap = new Map<number, LaunchBoxImageRecord[]>();
    for (const image of dbImages) {
      const list = imagesMap.get(image.gameId) || [];
      list.push({
        databaseId: image.gameId,
        fileName: image.fileName,
        type: image.type,
        region: image.region || undefined,
      });
      imagesMap.set(image.gameId, list);
    }

    for (const row of dbGames) {
      const databaseId = Number(row.databaseId);
      games.push(
        hydrateLaunchBoxGame(
          row,
          altsMap.get(databaseId) || [],
          imagesMap.get(databaseId) || [],
        ),
      );
    }
  } catch (error) {
    console.error("[LaunchBox] Failed to retrieve candidate records", error);
    return null;
  }

  const match = pickBestLaunchBoxGame(games, name, platform);
  if (!match) return null;

  return mapLaunchBoxGameToMetadata(match);
}
