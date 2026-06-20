import { metadataTitleSimilarity } from "@/lib/metadataTitleSimilarity";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

import {
  ensureLaunchBoxIndex,
  isLaunchBoxEnabled,
  type LaunchBoxGameRecord,
} from "./indexStore";
import {
  platformMatchesLaunchBoxEntry,
  resolveLaunchBoxPlatformNames,
} from "./platformMap";

function scoreLaunchBoxCandidate(
  game: LaunchBoxGameRecord,
  requestedName: string,
  platform?: string | null,
): number {
  const names = [game.name, ...game.alternateNames];
  let score = names.reduce(
    (best, candidate) =>
      Math.max(best, metadataTitleSimilarity(requestedName, candidate)),
    0,
  );

  if (platformMatchesLaunchBoxEntry(platform, game.platform)) {
    score += 0.28;
  } else if (resolveLaunchBoxPlatformNames(platform).length > 0) {
    score -= 0.12;
  }

  return score;
}

export function pickBestLaunchBoxGame(
  games: LaunchBoxGameRecord[],
  requestedName: string,
  platform?: string | null,
  minScore = 0.58,
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
  const attachments: MetadataAttachment[] = [];
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
    facts.push({
      kind: "rating",
      label: "LaunchBox",
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

  const aliases = Array.from(
    new Set([...game.alternateNames, game.name].filter(Boolean)),
  ).filter(
    (alias) => alias.toLowerCase().trim() !== game.name.toLowerCase().trim(),
  );

  return {
    title: game.name,
    description: game.overview,
    releaseDate: formatReleaseDate(game),
    publishers: game.publisher ? [{ name: game.publisher }] : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    aliases: aliases.length > 0 ? aliases : undefined,
    facts: facts.length > 0 ? facts : undefined,
    externalIds: { launchbox: String(game.databaseId) },
  };
}

export async function fetchFromLaunchBox(
  name: string,
  platform?: string | null,
): Promise<MetadataResult | null> {
  if (!isLaunchBoxEnabled()) return null;

  const index = await ensureLaunchBoxIndex();
  if (!index?.length) {
    console.info(
      "[LaunchBox] Index unavailable — set LAUNCHBOX_ENABLED=true or LAUNCHBOX_METADATA_XML to build it",
    );
    return null;
  }

  const match = pickBestLaunchBoxGame(index, name, platform);
  if (!match) return null;

  return mapLaunchBoxGameToMetadata(match);
}
