/**
 * No-Intro Tier0 resolve — checksum-first (when known), else title FTS
 * (+ optional platform via DAT name). No covers; identify + catalogue facts only.
 */
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
import type {
  MetadataAdapterContext,
  RomChecksums,
} from "@/types/providerModule";

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

function readExternalId(
  ids: Record<string, string | null | undefined> | null | undefined,
  key: string,
): string | undefined {
  if (!ids) return undefined;
  const direct = ids[key]?.trim();
  if (direct) return direct;
  const lower = key.toLowerCase();
  for (const [entryKey, value] of Object.entries(ids)) {
    if (entryKey.toLowerCase() === lower && value?.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Build a checksum query from explicit `romChecksums` and/or externalIds
 * (`sha1` / `md5` / `crc` / `crc32`).
 */
export function romChecksumsFromMetadataContext(input: {
  romChecksums?: RomChecksums | null;
  externalIds?: Record<string, string | null | undefined> | null;
}): NoIntroChecksumQuery | null {
  const explicit = input.romChecksums;
  const ids = input.externalIds;
  const query: NoIntroChecksumQuery = {
    sha1: explicit?.sha1?.trim() || readExternalId(ids, "sha1"),
    md5: explicit?.md5?.trim() || readExternalId(ids, "md5"),
    crc:
      explicit?.crc?.trim() ||
      readExternalId(ids, "crc") ||
      readExternalId(ids, "crc32"),
  };
  if (!query.sha1 && !query.md5 && !query.crc) return null;
  return query;
}

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

  const externalIds: Record<string, string> = {
    nointro: String(game.id),
  };
  if (primaryRom?.crc) externalIds.crc = primaryRom.crc;
  if (primaryRom?.md5) externalIds.md5 = primaryRom.md5;
  if (primaryRom?.sha1) externalIds.sha1 = primaryRom.sha1;

  return withMetadataPlatformKeys({
    title: game.name,
    platformKey: detectVideoGamePlatformKey(game.datName) || undefined,
    description: game.description,
    aliases: aliases.length > 0 ? aliases : undefined,
    facts,
    externalIds,
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

/** Checksum path when a ROM hash is known (file ingest / prior enrich). */
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

/**
 * Adapter entry: prefer exact ROM checksum lookup, then title FTS.
 */
export async function resolveNoIntroMetadata(
  ctx: Pick<
    MetadataAdapterContext,
    "name" | "platform" | "romChecksums" | "externalIds" | "match"
  >,
): Promise<MetadataResult | null> {
  const checksum = romChecksumsFromMetadataContext({
    romChecksums: ctx.romChecksums,
    externalIds: {
      ...(ctx.match?.externalIds ?? {}),
      ...(ctx.externalIds ?? {}),
    },
  });
  if (checksum) {
    const byHash = await fetchFromNoIntroByChecksum(checksum, ctx.platform);
    if (byHash) return byHash;
  }
  return fetchFromNoIntro(ctx.name, ctx.platform);
}
