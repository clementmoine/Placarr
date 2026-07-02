import axios from "axios";

import { inferTextLanguage } from "@/lib/locale/preference";
import { metadataTitleSimilarity } from "@/lib/metadata/titleMatching";
import {
  explicitVolumeNumbers,
  hasExplicitVolumeMarker,
  stripVolumeMarkersFromTitle,
} from "@/lib/title/volumeNumber";

const OPENLIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
const OPENLIBRARY_TIMEOUT_MS = 12_000;
const MIN_CROSS_EDITION_SIMILARITY = 0.55;
const MIN_FRANCHISE_OCCURRENCES = 2;

type OpenLibrarySearchDoc = {
  title?: string;
};

type OpenLibrarySearchResponse = {
  docs?: OpenLibrarySearchDoc[];
};

function pickLatinAuthorName(
  authors?: Array<{ name?: string | null }> | null,
): string | null {
  if (!authors?.length) return null;
  for (const author of authors) {
    const name = author.name?.trim();
    if (!name) continue;
    if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(name)) continue;
    if (/[A-Za-z]/.test(name)) return name;
  }
  return null;
}

async function fetchOpenLibraryTitlesByAuthor(
  authorName: string,
): Promise<string[]> {
  try {
    const response = await axios.get<OpenLibrarySearchResponse>(
      OPENLIBRARY_SEARCH_URL,
      {
        timeout: OPENLIBRARY_TIMEOUT_MS,
        params: {
          author: authorName,
          limit: 40,
        },
      },
    );
    return (response.data.docs || [])
      .map((doc) => doc.title?.trim())
      .filter((title): title is string => Boolean(title));
  } catch {
    return [];
  }
}

function franchiseRootCounts(
  titles: string[],
): Map<string, { count: number; label: string }> {
  const counts = new Map<string, { count: number; label: string }>();
  for (const title of titles) {
    const key = stripVolumeMarkersFromTitle(title);
    if (key.length < 4) continue;
    const trimmed = title.trim();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      const preferNew =
        !hasExplicitVolumeMarker(trimmed) &&
        (hasExplicitVolumeMarker(existing.label) ||
          trimmed.length < existing.label.length);
      if (preferNew) {
        existing.label = trimmed;
      }
    } else {
      counts.set(key, { count: 1, label: trimmed });
    }
  }
  return counts;
}

/**
 * Cross-language search aliases for books/manga: when providers only return a
 * localized title (e.g. « L'Attaque des Titans »), look up the author's
 * Open Library bibliography and index recurring franchise names + volume-matched
 * editions (« Attack on Titan », « Shingeki no Kyojin », …).
 */
export async function supplementBookSearchAliases(
  title: string | null | undefined,
  authors?: Array<{ name?: string | null }> | null,
): Promise<string[]> {
  const displayTitle = title?.trim();
  if (!displayTitle) return [];

  const authorName = pickLatinAuthorName(authors);
  if (!authorName) return [];

  const authorTitles = await fetchOpenLibraryTitlesByAuthor(authorName);
  if (authorTitles.length === 0) return [];

  const displayRoot = stripVolumeMarkersFromTitle(displayTitle);
  const displayLang = inferTextLanguage(displayRoot);
  const displayVolume = explicitVolumeNumbers(displayTitle)[0] ?? null;
  const rootCounts = franchiseRootCounts(authorTitles);
  const aliases = new Set<string>();

  for (const candidate of authorTitles) {
    const candidateRoot = stripVolumeMarkersFromTitle(candidate);
    const candidateVolume = explicitVolumeNumbers(candidate)[0] ?? null;
    const similarity = metadataTitleSimilarity(displayRoot, candidateRoot);

    if (displayVolume !== null && candidateVolume !== null) {
      if (candidateVolume !== displayVolume) continue;
      if (similarity >= MIN_CROSS_EDITION_SIMILARITY && similarity < 0.99) {
        aliases.add(candidate);
      }
      continue;
    }

    if (candidateRoot === displayRoot) continue;
    const franchise = rootCounts.get(candidateRoot);
    if (!franchise || franchise.count < MIN_FRANCHISE_OCCURRENCES) continue;

    const candidateLang = inferTextLanguage(franchise.label);
    if (candidateLang === displayLang) continue;
    if (similarity >= 0.99) continue;

    aliases.add(franchise.label);
  }

  return Array.from(aliases);
}

export async function withBookSearchAliases<T extends {
  title?: string | null;
  aliases?: string[] | null;
  authors?: Array<{ name?: string | null }> | null;
}>(metadata: T): Promise<T> {
  const extra = await supplementBookSearchAliases(
    metadata.title,
    metadata.authors,
  );
  if (extra.length === 0) return metadata;

  const { aliasesExcludingTitle } = await import("@/lib/metadata/aliases");
  const aliases = aliasesExcludingTitle(
    metadata.title ?? "",
    ...(metadata.aliases || []),
    ...extra,
  );
  if (!aliases?.length) return metadata;
  return { ...metadata, aliases };
}
