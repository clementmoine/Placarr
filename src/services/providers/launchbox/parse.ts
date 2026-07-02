export type LaunchBoxAlternateNameRecord = {
  databaseId: number;
  name: string;
  region?: string;
};

export type LaunchBoxImageRecord = {
  databaseId: number;
  fileName: string;
  type: string;
  region?: string;
};

export type LaunchBoxGameRecord = {
  databaseId: number;
  name: string;
  platform: string;
  overview?: string;
  releaseDate?: string;
  releaseYear?: string;
  developer?: string;
  publisher?: string;
  genres?: string[];
  esrb?: string;
  communityRating?: number;
  communityRatingCount?: number;
  maxPlayers?: number;
  releaseType?: string;
  cooperative?: boolean;
  videoUrl?: string;
  wikipediaUrl?: string;
  alternateNames: LaunchBoxAlternateNameRecord[];
  images: LaunchBoxImageRecord[];
};

function readTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  const value = match?.[1]?.trim();
  return value || undefined;
}

function readAllTags(block: string, tag: string): string[] {
  return Array.from(
    block.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g")),
  )
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function readBooleanTag(block: string, tag: string): boolean | undefined {
  const value = readTag(block, tag)?.toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function readNumberTag(block: string, tag: string): number | undefined {
  const raw = readTag(block, tag);
  if (!raw) return undefined;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

export function parseLaunchBoxGameBlock(
  block: string,
): Omit<LaunchBoxGameRecord, "alternateNames" | "images"> | null {
  const name = readTag(block, "Name");
  const databaseId = Number(readTag(block, "DatabaseID"));
  const platform = readTag(block, "Platform");
  if (!name || !Number.isFinite(databaseId) || !platform) return null;

  const genresRaw = readTag(block, "Genres");

  return {
    databaseId,
    name,
    platform,
    overview: readTag(block, "Overview"),
    releaseDate: readTag(block, "ReleaseDate"),
    releaseYear: readTag(block, "ReleaseYear"),
    developer: readTag(block, "Developer"),
    publisher: readTag(block, "Publisher"),
    genres: genresRaw
      ? genresRaw
          .split(/[,/|•]+/)
          .map((value) => value.trim())
          .filter(Boolean)
      : undefined,
    esrb: readTag(block, "ESRB"),
    communityRating: readNumberTag(block, "CommunityRating"),
    communityRatingCount: readNumberTag(block, "CommunityRatingCount"),
    maxPlayers: readNumberTag(block, "MaxPlayers"),
    releaseType: readTag(block, "ReleaseType"),
    cooperative: readBooleanTag(block, "Cooperative"),
    videoUrl: readTag(block, "VideoURL"),
    wikipediaUrl: readTag(block, "WikipediaURL"),
  };
}

export function parseLaunchBoxAlternateNameBlock(
  block: string,
): LaunchBoxAlternateNameRecord | null {
  const name = readTag(block, "AlternateName");
  const databaseId = Number(readTag(block, "DatabaseID"));
  if (!name || !Number.isFinite(databaseId)) return null;

  return {
    databaseId,
    name,
    region: readTag(block, "Region"),
  };
}

export function parseLaunchBoxImageBlock(
  block: string,
): LaunchBoxImageRecord | null {
  const fileName = readTag(block, "FileName");
  const databaseId = Number(readTag(block, "DatabaseID"));
  const type = readTag(block, "Type");
  if (!fileName || !Number.isFinite(databaseId) || !type) return null;

  return {
    databaseId,
    fileName,
    type,
    region: readTag(block, "Region"),
  };
}

export const LAUNCHBOX_XML_BLOCKS = [
  "Game",
  "GameAlternateName",
  "GameImage",
] as const;

export type LaunchBoxXmlBlockTag = (typeof LAUNCHBOX_XML_BLOCKS)[number];

export function findNextLaunchBoxBlock(buffer: string): {
  tag: LaunchBoxXmlBlockTag;
  start: number;
} | null {
  let best: { tag: LaunchBoxXmlBlockTag; start: number } | null = null;

  for (const tag of LAUNCHBOX_XML_BLOCKS) {
    const marker = `<${tag}>`;
    const start = buffer.indexOf(marker);
    if (start === -1) continue;
    if (!best || start < best.start) {
      best = { tag, start };
    }
  }

  return best;
}

export function extractLaunchBoxBlock(
  buffer: string,
  tag: LaunchBoxXmlBlockTag,
  start: number,
): { block: string; rest: string } | null {
  const end = buffer.indexOf(`</${tag}>`, start);
  if (end === -1) return null;

  const block = buffer.slice(start, end + `</${tag}>`.length);
  const rest = buffer.slice(end + `</${tag}>`.length);
  return { block, rest };
}
