import {
  Item,
  Metadata,
  Type,
  AttachmentType,
  Attachment,
  Author,
  Publisher,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import levenshtein from "fast-levenshtein";
import { convertXML } from "simple-xml-to-json";
import { decode as decodeHTMLEntities } from "html-entities";
import axios from "axios";
import { parse, format } from "date-fns";
import { fr, enUS } from "date-fns/locale";

export interface MetadataAttachment {
  type: AttachmentType;
  title?: string;
  duration?: number;
  url: string;
}

export interface MetadataResult {
  title?: string;
  authors?: { name: string; imageUrl?: string | null }[];
  publishers?: { name: string; imageUrl?: string | null }[];
  duration?: number;
  pageCount?: number;
  tracksCount?: number;
  description?: string;
  releaseDate?: string;
  imageUrl?: string;
  attachments?: MetadataAttachment[];
}

const mapAuthors = (authors?: MetadataResult["authors"]) =>
  authors && authors.length > 0
    ? {
        connectOrCreate: authors.map((author) => ({
          where: { name: author.name },
          create: { name: author.name, imageUrl: author.imageUrl },
        })),
      }
    : undefined;

const mapPublishers = (publishers?: MetadataResult["publishers"]) =>
  publishers && publishers.length > 0
    ? {
        connectOrCreate: publishers.map((publisher) => ({
          where: { name: publisher.name },
          create: { name: publisher.name, imageUrl: publisher.imageUrl },
        })),
      }
    : undefined;

const mapAttachments = (attachments?: Attachment[]) =>
  attachments?.map((attachment) => ({
    type: attachment.type,
    title: attachment.title ?? undefined,
    duration: attachment.duration ?? undefined,
    url: attachment.url,
  })) ?? [];

export function formatMetadataForStorage(
  metadata: MetadataResult,
  sourceType: Type,
  sourceQuery: string,
) {
  return {
    title: metadata.title ?? null,
    authors: mapAuthors(metadata.authors),
    publishers: mapPublishers(metadata.publishers),
    duration: metadata.duration ?? null,
    pageCount: metadata.pageCount ?? null,
    tracksCount: metadata.tracksCount ?? null,
    description: metadata.description ?? null,
    releaseDate: metadata.releaseDate ?? null,
    imageUrl: metadata.imageUrl ?? null,
    sourceType,
    sourceQuery,
    lastFetched: new Date(),
  };
}

export function formatMetadataFromStorage(
  metadata: Metadata & {
    attachments?: Attachment[];
    authors?: Author[];
    publishers?: Publisher[];
  },
): MetadataResult {
  return {
    title: metadata.title || undefined,
    authors:
      metadata.authors?.map((author: Author) => ({
        name: author.name,
        imageUrl: author.imageUrl,
      })) || undefined,
    publishers:
      metadata.publishers?.map((publisher: Publisher) => ({
        name: publisher.name,
        imageUrl: publisher.imageUrl,
      })) || undefined,
    duration: metadata.duration || undefined,
    pageCount: metadata.pageCount || undefined,
    tracksCount: metadata.tracksCount || undefined,
    description: metadata.description || undefined,
    releaseDate: metadata.releaseDate || undefined,
    imageUrl: metadata.imageUrl || undefined,
    attachments: mapAttachments(metadata.attachments),
  };
}

export async function getMetadata(
  name: string,
  type: string,
  barcode?: string | null,
): Promise<MetadataResult | null> {
  try {
    const metadata = await fetchMetadataByType(name, type, barcode);

    return metadata;
  } catch (err) {
    console.error("Failed to fetch metadata:", err);
    return null;
  }
}

export async function fetchAndStoreMetadata(
  itemId: Item["id"],
  name: Item["name"],
  type: Type,
  barcode?: string | null,
  forceRefresh = false,
): Promise<MetadataResult | null> {
  // Check if we should use cached metadata
  if (!forceRefresh) {
    const cachedMetadata = await getCachedMetadata(itemId);
    if (cachedMetadata) {
      return formatMetadataFromStorage(cachedMetadata);
    }
  }

  // Fetch new metadata using the name for lookup only
  const metadata = await getMetadata(name, type, barcode);
  if (!metadata) return null;

  try {
    // Store the metadata without updating the item's name
    const storedMetadata = await storeMetadata(itemId, metadata, type, name);
    return formatMetadataFromStorage(storedMetadata);
  } catch (error) {
    console.error("Error storing metadata:", error);
    return null;
  }
}

async function getCachedMetadata(
  itemId: Item["id"],
): Promise<(Metadata & { attachments: Attachment[] }) | null> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { metadata: { include: { attachments: true } } },
  });
  return item?.metadata || null;
}

async function storeMetadata(
  itemId: Item["id"],
  metadata: MetadataResult,
  type: Type,
  name: string,
): Promise<
  Metadata & {
    attachments?: Attachment[];
    authors?: Author[];
    publishers?: Publisher[];
  }
> {
  const formattedMetadata = await formatMetadataForStorage(
    metadata,
    type,
    name,
  );

  const now = new Date();

  // First, get the existing metadata if any
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      metadata: {
        include: { attachments: true, authors: true, publishers: true },
      },
    },
  });

  // Deduplicate attachments by URL
  const uniqueAttachments = (metadata.attachments || []).filter(
    (attachment, index, self) =>
      index === self.findIndex((a) => a.url === attachment.url),
  );

  const metadataData = {
    ...formattedMetadata,
    lastFetched: now,
    updatedAt: now,
  };

  if (item?.metadata) {
    // Delete existing attachments
    await prisma.attachment.deleteMany({
      where: { metadataId: item.metadata.id },
    });

    // Update existing metadata with new authors and publishers
    return prisma.metadata.update({
      where: { id: item.metadata.id },
      data: {
        ...metadataData,
        attachments: {
          create: uniqueAttachments,
        },
        authors: {
          set: [], // Disconnect all existing authors
          connectOrCreate: formattedMetadata.authors?.connectOrCreate || [],
        },
        publishers: {
          set: [], // Disconnect all existing publishers
          connectOrCreate: formattedMetadata.publishers?.connectOrCreate || [],
        },
      },
      include: { attachments: true, authors: true, publishers: true },
    });
  } else {
    // Create new metadata and connect it to the item
    return prisma.metadata.create({
      data: {
        ...metadataData,
        items: {
          connect: { id: itemId },
        },
        attachments: {
          create: uniqueAttachments,
        },
      },
      include: { attachments: true, authors: true, publishers: true },
    });
  }
}

async function fetchMetadataByType(
  name: string,
  type: string,
  barcode?: string | null,
) {
  switch (type) {
    case "musics":
      return fetchFromDeezer(name, barcode);
    case "games":
      return fetchFromRawg(name);
    case "boardgames":
      return fetchFromBGG(name);
    case "books":
      return fetchFromOpenLibrary(name, barcode);
    case "movies":
      return fetchFromTMDB(name);
    default:
      return null;
  }
}

async function fetchFromDeezer(name: string, barcode?: string | null) {
  const searchUrl = `https://api.deezer.com/search/album?q=${encodeURIComponent(name)}`;
  const res = await axios.get(searchUrl);
  const data = res.data;

  if (!data.data || data.data.length === 0) return null;

  let bestMatch = null;
  let minDistance = Infinity;

  for (const album of data.data) {
    const albumDetailsRes = await axios.get(
      `https://api.deezer.com/album/${album.id}`,
    );
    const albumDetails = albumDetailsRes.data;

    // Try to match the album with upc code
    if (barcode && albumDetails.upc === barcode) {
      bestMatch = albumDetails;
      break;
    }

    const distance = levenshtein.get(
      name.toLowerCase(),
      albumDetails.title.toLowerCase(),
    );
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = albumDetails;
    }
  }

  if (!bestMatch) return null;

  return {
    title: bestMatch.title,
    authors: bestMatch.contributors.map(
      (c: { name: string; picture_xl: string }) => ({
        name: c.name,
        imageUrl: c.picture_xl,
      }),
    ),
    publishers: [
      {
        name: bestMatch.label,
      },
    ],
    duration: bestMatch.duration,
    tracksCount: bestMatch.nb_tracks,
    releaseDate: bestMatch.release_date,
    imageUrl: bestMatch.cover_big,
    attachments: bestMatch.tracks.data.map(
      (track: { title: string; duration: number; preview: string }) => ({
        type: "audio",
        title: track.title,
        duration: track.duration,
        url: track.preview,
      }),
    ),
  };
}

async function fetchFromRawg(name: string) {
  const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(name)}&key=${process.env.RAWG_API_KEY}`;
  const res = await axios.get(url);
  const data = res.data;

  if (!data.results || data.results.length === 0) return null;

  let bestMatch = data.results[0];
  let minDistance = levenshtein.get(
    name.toLowerCase(),
    bestMatch.name.toLowerCase(),
  );

  for (const game of data.results) {
    const distance = levenshtein.get(
      name.toLowerCase(),
      game.name.toLowerCase(),
    );
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = game;
    }
  }

  if (!bestMatch) return null;

  return {
    title: bestMatch.name,
    releaseDate: bestMatch.released,
    imageUrl: bestMatch.background_image,
    attachments:
      bestMatch.short_screenshots?.map((s: { image: string }) => ({
        type: "image",
        url: s.image,
      })) || [],
  };
}

interface BGGChild {
  name?: { type: string; value: string };
  description?: { content: string };
  yearpublished?: { value: string };
  image?: { content: string };
  link?: { type: string; id: string; value: string };
}

interface BGGItem {
  item: {
    type: string;
    id: string;
    children: BGGChild[];
  };
}

interface BGGResponse {
  items?: {
    children?: BGGItem[];
  };
}

async function fetchFromBGG(name: string) {
  try {
    // First, search for the game
    const searchUrl = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(name)}&type=boardgame`;
    const searchRes = await axios.get(searchUrl, { responseType: "text" });
    const searchText = searchRes.data;
    const searchData = convertXML(searchText) as BGGResponse;
    const items = searchData.items?.children || [];
    if (items.length === 0) return null;

    // Find best match using Levenshtein distance
    let bestMatch = items[0];
    let minDistance = levenshtein.get(
      name.toLowerCase(),
      bestMatch.item.children
        .find((child: BGGChild) => child.name?.type === "primary")
        ?.name?.value?.toLowerCase() || "",
    );

    for (const item of items) {
      const itemName =
        item.item.children
          .find((child: BGGChild) => child.name?.type === "primary")
          ?.name?.value?.toLowerCase() || "";
      const distance = levenshtein.get(name.toLowerCase(), itemName);
      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = item;
      }
    }

    // Get the best match's ID
    const gameId = bestMatch.item.id;
    if (!gameId) return null;

    // Get detailed game info
    const detailsUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&stats=1`;
    const detailsRes = await axios.get(detailsUrl, { responseType: "text" });
    const detailsText = detailsRes.data;
    const detailsData = convertXML(detailsText) as BGGResponse;
    const game = detailsData.items?.children?.[0]?.item;
    if (!game) return null;

    // Get primary name
    const primaryName = game.children.find(
      (child: BGGChild) => child.name?.type === "primary",
    )?.name?.value;

    // Get description
    const rawDescription = game.children.find(
      (child: BGGChild) => child.description,
    )?.description?.content;
    const description = rawDescription
      ? decodeHTMLEntities(rawDescription)
          .replace(/&#10;/g, "\n")
          .replace(/&ouml;/g, "ö")
          .replace(/&mdash;/g, "—")
      : undefined;

    // Get year published
    const yearPublished = game.children.find(
      (child: BGGChild) => child.yearpublished,
    )?.yearpublished?.value;

    // Get image
    const image = game.children.find((child: BGGChild) => child.image)?.image
      ?.content;

    // Get designers
    const designers = game.children
      .filter((child: BGGChild) => child.link?.type === "boardgamedesigner")
      .map((child: BGGChild) => ({
        name: child.link?.value || "",
      }));

    // Get publishers
    const publishers = game.children
      .filter((child: BGGChild) => child.link?.type === "boardgamepublisher")
      .map((child: BGGChild) => ({
        name: child.link?.value || "",
      }));

    return {
      title: primaryName,
      description,
      releaseDate: yearPublished,
      imageUrl: image,
      authors: designers,
      publishers,
      attachments: image
        ? [
            {
              type: "image",
              url: image,
            },
          ]
        : [],
    };
  } catch (error) {
    console.error("Error fetching from BGG:", error);
    return null;
  }
}

interface OpenLibraryWork {
  key: string;
  title: string;
  authors?: { key: string }[];
  publishers?: string[];
  number_of_pages?: number;
  description?: { value: string } | string;
  publish_date?: string;
  covers?: number[];
}

interface OpenLibrarySearchResponse {
  docs?: Array<{
    key: string;
    title: string;
    title_suggest?: string;
    subtitle?: string;
    author_name?: string[];
    author_key?: string[];
    language?: string[];
    edition_count?: number;
    has_fulltext?: boolean;
    first_sentence?: string[];
    publisher?: string[];
    publish_year?: number[];
    publish_date?: string[];
    cover_i?: number;
    cover_edition_key?: string;
    ebook_access?: string;
    ia?: string[];
    ia_collection_s?: string;
    public_scan_b?: boolean;
  }>;
}

interface OpenLibraryAuthor {
  name: string;
  photos?: number[];
}

interface OpenLibraryEditionsResponse {
  entries?: Array<{
    key: string;
    title: string;
    languages?: Array<{ key: string }>;
    publishers?: string[];
    publish_date?: string;
    number_of_pages?: number;
    covers?: number[];
    authors?: Array<{ key: string }>;
    description?: { value: string } | string;
  }>;
}

async function fetchFromOpenLibrary(name: string, barcode?: string | null) {
  const MAX_RETRIES = 3;
  const INITIAL_DELAY = 1000; // 1 second

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const fetchWithRetry = async <T>(url: string, retryCount = 0): Promise<T> => {
    try {
      const response = await axios.get<T>(url);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as { response?: { status: number } };
      if (
        (axiosError.response?.status === 503 ||
          axiosError.response?.status === 500) &&
        retryCount < MAX_RETRIES
      ) {
        const delay = INITIAL_DELAY * Math.pow(2, retryCount);
        console.log(
          `Open Library API request failed with status ${axiosError.response.status}, retrying in ${delay}ms...`,
        );
        await sleep(delay);
        return fetchWithRetry<T>(url, retryCount + 1);
      }
      throw error;
    }
  };

  try {
    let workId: string | null = null;
    let workData: OpenLibraryWork | null = null;

    // Extract year from name if it's in parentheses
    const yearMatch = name.match(/\((\d{4})\)/);
    const requestedYear = yearMatch ? parseInt(yearMatch[1]) : null;
    const cleanName = yearMatch ? name.replace(/\(\d{4}\)/, "").trim() : name;

    // First try ISBN search if barcode is provided
    if (barcode) {
      const isbnData = await fetchWithRetry<
        OpenLibraryWork & { works?: { key: string }[] }
      >(`https://openlibrary.org/isbn/${barcode}.json`);

      if (isbnData && isbnData.works?.[0]?.key) {
        workId = isbnData.works[0].key;
        workData = isbnData;
      }
    }

    // If no results from ISBN or no barcode provided, try title search
    if (!workId) {
      const searchQuery = barcode ? `${cleanName} isbn:${barcode}` : cleanName;

      const data = await fetchWithRetry<OpenLibrarySearchResponse>(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(searchQuery)}`,
      );

      if (data.docs && data.docs.length > 0) {
        // Find the work with the most editions and data
        let bestWork = data.docs[0];
        let maxScore = 0;

        for (const doc of data.docs) {
          let score = 0;
          // Higher score for works with more editions
          score += (doc.edition_count || 0) * 10;
          // Bonus for works with full text
          if (doc.has_fulltext) score += 50;
          // Bonus for works with cover
          if (doc.cover_i) score += 30;
          // Bonus for works with multiple languages
          if (doc.language?.length) score += doc.language.length * 5;
          // Bonus for works with author info
          if (doc.author_name?.length) score += 20;

          // Add significant bonus for year match
          if (requestedYear && doc.publish_year?.length) {
            const hasMatchingYear = doc.publish_year.some(
              (year) => Math.abs(year - requestedYear) <= 1,
            );
            if (hasMatchingYear) {
              score += 100; // High bonus for year match
            }
          }

          if (score > maxScore) {
            maxScore = score;
            bestWork = doc;
          }
        }

        workId = bestWork.key;

        // Get all editions of the work
        const editionsData = await fetchWithRetry<OpenLibraryEditionsResponse>(
          `https://openlibrary.org${workId}/editions.json`,
        );

        if (editionsData.entries && editionsData.entries.length > 0) {
          // Sort editions by language preference and title distance
          const sortedEditions = editionsData.entries
            .map((edition) => {
              const distance = levenshtein.get(
                cleanName.toLowerCase(),
                edition.title.toLowerCase(),
              );

              // Get the language code from the full key
              const fullLanguageKey = edition.languages?.[0]?.key || "";
              const language = fullLanguageKey.includes("/fre")
                ? "fr"
                : fullLanguageKey.includes("/eng")
                  ? "en"
                  : fullLanguageKey.includes("/spa")
                    ? "sp"
                    : fullLanguageKey.includes("/ger")
                      ? "ge"
                      : fullLanguageKey.includes("/por")
                        ? "pt"
                        : fullLanguageKey.includes("/ita")
                          ? "it"
                          : "en";

              // Calculate language score (higher is better)
              const languageScore =
                language === "fr" ? 2 : language === "en" ? 1 : 0;

              // Check if this edition matches the requested year
              const editionYear = edition.publish_date
                ? parseInt(edition.publish_date.match(/\d{4}/)?.[0] || "0")
                : 0;
              const yearMatches = requestedYear
                ? Math.abs(editionYear - requestedYear) <= 1
                : false;

              return {
                edition,
                distance,
                languageScore,
                yearMatches,
              };
            })
            .sort((a, b) => {
              // First sort by language preference (higher score first)
              if (a.languageScore !== b.languageScore) {
                return b.languageScore - a.languageScore;
              }
              // Then by year match
              if (a.yearMatches !== b.yearMatches) {
                return b.yearMatches ? 1 : -1;
              }
              // Finally by title distance
              return a.distance - b.distance;
            });

          workData = sortedEditions[0].edition;
        } else {
          // Fallback to the original work if no editions found
          workData = await fetchWithRetry<OpenLibraryWork>(
            `https://openlibrary.org${workId}.json`,
          );
        }
      }
    }

    if (!workId || !workData) return null;

    // Get author info
    const authors =
      workData.authors
        ?.map((author: { key: string }) => {
          if (!author?.key) return null;
          return fetchWithRetry<OpenLibraryAuthor>(
            `https://openlibrary.org${author.key}.json`,
          )
            .then((res) => ({
              name: res.name,
              imageUrl: res.photos?.[0]
                ? `https://covers.openlibrary.org/a/id/${res.photos[0]}-L.jpg`
                : null,
            }))
            .catch(() => null);
        })
        .filter(Boolean) || [];

    const authorDetails = (await Promise.all(authors)).filter(Boolean);

    // Parse and format the date
    let formattedDate: string | undefined;
    if (workData.publish_date) {
      try {
        // Try parsing with different locales
        const locales = [
          { locale: fr, format: "d MMMM yyyy" },
          { locale: enUS, format: "MMMM d, yyyy" },
          { locale: enUS, format: "d MMMM yyyy" },
        ];

        for (const { locale, format: dateFormat } of locales) {
          try {
            const date = parse(workData.publish_date, dateFormat, new Date(), {
              locale,
            });
            if (!isNaN(date.getTime())) {
              formattedDate = format(date, "yyyy-MM-dd");
              break;
            }
          } catch {
            // Try next locale/format
            continue;
          }
        }
      } catch (error) {
        console.error("Error parsing date:", error);
      }
    }

    return {
      title: workData.title,
      authors: authorDetails,
      publishers:
        workData.publishers?.map((publisher: string) => ({
          name: publisher,
        })) || [],
      pageCount: workData.number_of_pages,
      description:
        typeof workData.description === "string"
          ? workData.description
          : workData.description?.value,
      releaseDate: formattedDate,
      imageUrl: workData.covers?.[0]
        ? `https://covers.openlibrary.org/b/id/${workData.covers[0]}-L.jpg`
        : null,
      attachments:
        workData.covers?.slice(1).map((coverId: number) => ({
          type: "image",
          url: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`,
        })) || [],
    };
  } catch (error) {
    console.error("Error fetching from Open Library:", error);
    return null;
  }
}

async function fetchFromTMDB(name: string) {
  const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(name)}&api_key=${process.env.TMDB_API_KEY}`;
  const res = await axios.get(searchUrl);
  const data = res.data;

  if (!data.results || data.results.length === 0) return null;

  let bestMatch = data.results[0];
  let minDistance = levenshtein.get(
    name.toLowerCase(),
    bestMatch.title.toLowerCase(),
  );

  for (const movie of data.results) {
    const distance = levenshtein.get(
      name.toLowerCase(),
      movie.title.toLowerCase(),
    );
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = movie;
    }
  }

  const detailsRes = await axios.get(
    `https://api.themoviedb.org/3/movie/${bestMatch.id}?api_key=${process.env.TMDB_API_KEY}`,
  );
  const details = detailsRes.data;

  const creditsRes = await axios.get(
    `https://api.themoviedb.org/3/movie/${bestMatch.id}/credits?api_key=${process.env.TMDB_API_KEY}`,
  );
  const credits = creditsRes.data;

  return {
    title: bestMatch.title,
    authors: credits.crew
      .filter((person: { job: string }) => person.job === "Director")
      .map((person: { name: string; profile_path: string }) => ({
        name: person.name,
        imageUrl: person.profile_path
          ? `https://image.tmdb.org/t/p/w780${person.profile_path}`
          : null,
      })),
    publishers: details.production_companies.map(
      (company: { name: string; logo_path: string }) => ({
        name: company.name,
        imageUrl: company.logo_path
          ? `https://image.tmdb.org/t/p/w780${company.logo_path}`
          : null,
      }),
    ),
    duration: details.runtime,
    description: details.overview,
    releaseDate: details.release_date,
    imageUrl: bestMatch.poster_path
      ? `https://image.tmdb.org/t/p/w780${bestMatch.poster_path}`
      : null,
    attachments: bestMatch.backdrop_path
      ? [
          {
            type: "image",
            url: `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`,
          },
        ]
      : [],
  };
}
