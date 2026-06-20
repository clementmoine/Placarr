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
  alternateNames: string[];
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

export function parseLaunchBoxGameBlock(
  block: string,
): LaunchBoxGameRecord | null {
  const name = readTag(block, "Name");
  const databaseId = Number(readTag(block, "DatabaseID"));
  const platform = readTag(block, "Platform");
  if (!name || !Number.isFinite(databaseId) || !platform) return null;

  const genresRaw = readTag(block, "Genres");
  const ratingRaw = readTag(block, "CommunityRating");

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
    communityRating: ratingRaw
      ? Number(ratingRaw.replace(",", "."))
      : undefined,
    alternateNames: readAllTags(block, "AlternateName"),
  };
}
