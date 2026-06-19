import axios from "axios";
import levenshtein from "fast-levenshtein";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";

const BASE_URL = "https://www.googleapis.com/books/v1/volumes";

interface GoogleBooksVolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
  pageCount?: number;
  categories?: string[];
  averageRating?: number;
  ratingsCount?: number;
  language?: string;
  previewLink?: string;
  infoLink?: string;
  imageLinks?: {
    smallThumbnail?: string;
    thumbnail?: string;
    small?: string;
    medium?: string;
    large?: string;
    extraLarge?: string;
  };
}

interface GoogleBooksVolume {
  id?: string;
  volumeInfo?: GoogleBooksVolumeInfo;
}

interface GoogleBooksResponse {
  items?: GoogleBooksVolume[];
}

function secureImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace(/^http:/i, "https:");
}

function parsePublishedDate(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}$/.test(value)) return `${value}-01-01`;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return undefined;
}

function pickIsbn(
  identifiers: GoogleBooksVolumeInfo["industryIdentifiers"],
): string | null {
  if (!Array.isArray(identifiers)) return null;
  const isbn13 = identifiers.find((entry) => entry?.type === "ISBN_13")?.identifier;
  const isbn10 = identifiers.find((entry) => entry?.type === "ISBN_10")?.identifier;
  return (
    normalizeProductBarcode(isbn13) ||
    normalizeProductBarcode(isbn10) ||
    null
  );
}

function buildGoogleBooksFacts(
  volumeInfo: GoogleBooksVolumeInfo,
  volumeId?: string,
): MetadataFact[] {
  const facts: MetadataFact[] = [];

  if (volumeId) {
    facts.push({
      kind: "external-link",
      label: "Google Books",
      value: "Voir la fiche",
      url: `https://books.google.com/books?id=${volumeId}`,
      source: "googlebooks",
      confidence: 0.68,
      priority: 38,
    });
  }

  if (typeof volumeInfo.infoLink === "string" && volumeInfo.infoLink.trim()) {
    facts.push({
      kind: "source-url",
      label: "Google Books",
      value: volumeInfo.infoLink.trim(),
      url: volumeInfo.infoLink.trim(),
      source: "googlebooks",
      confidence: 0.64,
      priority: 24,
    });
  }

  if (Array.isArray(volumeInfo.categories) && volumeInfo.categories.length > 0) {
    facts.push({
      kind: "genre",
      label: "Catégories",
      value: volumeInfo.categories.slice(0, 4).join(" • "),
      source: "googlebooks",
      confidence: 0.62,
      priority: 34,
    });
  }

  if (typeof volumeInfo.language === "string" && volumeInfo.language.trim()) {
    facts.push({
      kind: "language",
      label: "Langue",
      value: volumeInfo.language.trim().toUpperCase(),
      source: "googlebooks",
      confidence: 0.6,
      priority: 32,
    });
  }

  if (
    typeof volumeInfo.averageRating === "number" &&
    volumeInfo.averageRating > 0
  ) {
    const count =
      typeof volumeInfo.ratingsCount === "number" && volumeInfo.ratingsCount > 0
        ? ` (${new Intl.NumberFormat("fr-FR").format(volumeInfo.ratingsCount)} avis)`
        : "";
    facts.push({
      kind: "rating",
      label: "Google Books",
      value: `${volumeInfo.averageRating.toFixed(1)}/5${count}`,
      source: "googlebooks",
      confidence: 0.66,
      priority: 70,
    });
  }

  const isbn13 = volumeInfo.industryIdentifiers?.find(
    (entry) => entry?.type === "ISBN_13",
  )?.identifier;
  if (isbn13) {
    facts.push({
      kind: "identifier",
      label: "ISBN-13",
      value: isbn13,
      source: "googlebooks",
      confidence: 0.7,
      priority: 40,
    });
  }

  return facts;
}

function mapVolumeToMetadata(
  volume: GoogleBooksVolume,
  barcode?: string | null,
): MetadataResult | null {
  const volumeInfo = volume.volumeInfo;
  if (!volumeInfo?.title?.trim()) return null;

  const title = volumeInfo.subtitle?.trim()
    ? `${volumeInfo.title.trim()}: ${volumeInfo.subtitle.trim()}`
    : volumeInfo.title.trim();

  const imageUrl =
    secureImageUrl(volumeInfo.imageLinks?.large) ||
    secureImageUrl(volumeInfo.imageLinks?.medium) ||
    secureImageUrl(volumeInfo.imageLinks?.thumbnail) ||
    secureImageUrl(volumeInfo.imageLinks?.smallThumbnail);

  const discoveredBarcode =
    normalizeProductBarcode(barcode) || pickIsbn(volumeInfo.industryIdentifiers);

  const facts = buildGoogleBooksFacts(volumeInfo, volume.id);

  return {
    title,
    barcode: discoveredBarcode,
    authors: (volumeInfo.authors || []).map((name) => ({ name })),
    publishers: volumeInfo.publisher ? [{ name: volumeInfo.publisher }] : [],
    pageCount:
      typeof volumeInfo.pageCount === "number" && volumeInfo.pageCount > 0
        ? volumeInfo.pageCount
        : undefined,
    description: volumeInfo.description?.trim() || undefined,
    releaseDate: parsePublishedDate(volumeInfo.publishedDate),
    imageUrl,
    attachments: imageUrl
      ? [{ type: "cover", url: imageUrl, source: "googlebooks" }]
      : [],
    facts: facts.length > 0 ? facts : undefined,
  };
}

function pickBestVolume(
  volumes: GoogleBooksVolume[],
  name: string,
  barcode?: string | null,
): GoogleBooksVolume | null {
  if (volumes.length === 0) return null;

  const cleanName = name.trim().toLowerCase();
  const cleanedBarcode = normalizeProductBarcode(barcode);

  if (cleanedBarcode) {
    for (const volume of volumes) {
      const isbn = pickIsbn(volume.volumeInfo?.industryIdentifiers);
      if (isbn === cleanedBarcode) return volume;
    }
    if (volumes.length === 1) return volumes[0];
  }

  if (!cleanName) return volumes[0] || null;

  let best = volumes[0];
  let minDistance = Infinity;

  for (const volume of volumes) {
    const title = (volume.volumeInfo?.title || "").toLowerCase();
    const distance = levenshtein.get(cleanName, title);
    if (distance < minDistance) {
      minDistance = distance;
      best = volume;
    }
  }

  return best || null;
}

export function createGoogleBooksResolver() {
  return async function fetchFromGoogleBooks(
    name: string,
    barcode?: string | null,
  ): Promise<MetadataResult | null> {
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY?.trim();
    const cleanedBarcode = normalizeProductBarcode(barcode);
    const query = cleanedBarcode
      ? `isbn:${cleanedBarcode}`
      : name.trim()
        ? `intitle:${name.trim()}`
        : "";

    if (!query) return null;

    try {
      const response = await axios.get<GoogleBooksResponse>(BASE_URL, {
        params: {
          q: query,
          maxResults: 8,
          ...(apiKey ? { key: apiKey } : {}),
        },
        timeout: 8000,
      });

      const items = response.data?.items;
      if (!Array.isArray(items) || items.length === 0) return null;

      const best = pickBestVolume(items, name, cleanedBarcode);
      if (!best) return null;

      return mapVolumeToMetadata(best, cleanedBarcode);
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 429
      ) {
        throw new Error(
          apiKey
            ? "Google Books API rate limit exceeded"
            : "Google Books API rate limit — add GOOGLE_BOOKS_API_KEY to .env",
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[GoogleBooks] Error fetching metadata for "${name}":`, message);
      return null;
    }
  };
}
