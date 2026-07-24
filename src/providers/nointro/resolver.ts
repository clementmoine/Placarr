/**
 * No-Intro Tier0 resolve — title FTS (+ optional platform via DAT name) against
 * the local SQLite index. No covers; identify + catalogue facts only.
 */
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";

import {
  METADATA_TITLE_ALIGN_FLOOR,
  catalogLabelSimilarity,
} from "@/core/enrich/titleMatching";
import { withMetadataPlatformKeys } from "@/core/enrich/media/platformKeyStamp";
import { detectVideoGamePlatformKey } from "@/core/identify/platforms/platforms";

import {
  ensureNoIntroIndex,
  lookupNoIntroGamesByChecksum,
  searchNoIntroGamesByTitle,
  type NoIntroChecksumQuery,
  type NoIntroIndexedGame,
} from "./indexStore";

const TITLE_FLOOR = Math.max(METADATA_TITLE_ALIGN_FLOOR, 0.58);

/**
 * Strip trailing No-Intro parentheticals (region, language, Rev, Proto…).
 * Used for title alignment only — display keeps the full dump name.
 */
export function stripNoIntroReleaseFlags(name: string): string {
  let cleaned = name.trim();
  for (let i = 0; i < 8; i++) {
    const next = cleaned.replace(/\s*\([^)]*\)\s*$/u, "").trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned || name.trim();
}

function datMatchesPlatform(
  datName: string,
  platform?: string | null,
): boolean {
  if (!platform?.trim()) return true;
  const want = detectVideoGamePlatformKey(platform);
  if (!want) return true;
  const got = detectVideoGamePlatformKey(datName);
  return !got || got === want;
}

export function scoreNoIntroTitleMatch(
  query: string,
  game: NoIntroIndexedGame,
): number {
  const stripped = stripNoIntroReleaseFlags(game.name);
  return Math.max(
    catalogLabelSimilarity(query, game.name),
    catalogLabelSimilarity(query, stripped),
    game.description
      ? catalogLabelSimilarity(query, stripNoIntroReleaseFlags(game.description))
      : 0,
  );
}

export function pickBestNoIntroGame(
  games: NoIntroIndexedGame[],
  query: string,
  platform?: string | null,
): NoIntroIndexedGame | null {
  const scoped = games.filter((game) =>
    datMatchesPlatform(game.datName, platform),
  );
  let best: NoIntroIndexedGame | null = null;
  let bestScore = TITLE_FLOOR;
  for (const game of scoped) {
    const score = scoreNoIntroTitleMatch(query, game);
    if (score > bestScore) {
      bestScore = score;
      best = game;
    }
  }
  return best;
}

export function mapNoIntroGameToMetadata(
  game: NoIntroIndexedGame,
): MetadataResult {
  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "No-Intro",
      value: game.datName,
      source: "nointro",
      confidence: 0.7,
      priority: 40,
    },
  ];

  if (game.cloneOf) {
    facts.push({
      kind: "edition",
      label: "Clone of",
      value: game.cloneOf,
      source: "nointro",
      confidence: 0.65,
      priority: 36,
    });
  }

  const primaryRom = game.roms[0];
  if (primaryRom?.crc) {
    facts.push({
      kind: "identifier",
      label: "CRC",
      value: primaryRom.crc,
      source: "nointro",
      confidence: 0.8,
      priority: 50,
    });
  }

  const aliases = [game.cloneOf].filter(
    (alias): alias is string =>
      Boolean(alias?.trim()) &&
      alias!.toLowerCase().trim() !== game.name.toLowerCase().trim(),
  );

  return withMetadataPlatformKeys({
    title: game.name,
    platformKey: detectVideoGamePlatformKey(game.datName) || undefined,
    description: game.description,
    aliases: aliases.length > 0 ? aliases : undefined,
    facts,
    externalIds: { nointro: String(game.id) },
  });
}

export async function fetchFromNoIntro(
  name: string,
  platform?: string | null,
): Promise<MetadataResult | null> {
  const query = name.trim();
  if (!query) return null;

  const db = await ensureNoIntroIndex();
  if (!db) return null;

  const candidates = searchNoIntroGamesByTitle(db, query, 24);
  const best = pickBestNoIntroGame(candidates, query, platform);
  return best ? mapNoIntroGameToMetadata(best) : null;
}

/** Checksum path when a ROM hash is known (future dump / file ingest). */
export async function fetchFromNoIntroByChecksum(
  checksum: NoIntroChecksumQuery,
  platform?: string | null,
): Promise<MetadataResult | null> {
  const db = await ensureNoIntroIndex();
  if (!db) return null;
  const hits = lookupNoIntroGamesByChecksum(db, checksum);
  if (hits.length === 0) return null;
  const scoped = hits.filter((game) =>
    datMatchesPlatform(game.datName, platform),
  );
  const best = scoped[0] ?? hits[0];
  return best ? mapNoIntroGameToMetadata(best) : null;
}
