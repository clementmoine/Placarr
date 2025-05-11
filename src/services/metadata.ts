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
      return fetchFromGoogleBooks(name, barcode);
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

async function fetchFromGoogleBooks(name: string, barcode?: string | null) {
  const query = barcode ? `isbn:${barcode}` : name;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}`;
  const res = await axios.get(url);
  const data = res.data;

  if (!data.items || data.items.length === 0) return null;

  let bestMatch = data.items[0];
  let minDistance = levenshtein.get(
    name.toLowerCase(),
    bestMatch.volumeInfo.title.toLowerCase(),
  );

  for (const item of data.items) {
    const title = item.volumeInfo.title;
    const distance = levenshtein.get(name.toLowerCase(), title.toLowerCase());
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = item;
    }
  }

  if (!bestMatch) return null;

  async function getBestCoverUrl(thumbnailUrl: string): Promise<string> {
    const maxZoom = 6;

    for (let zoom = maxZoom; zoom >= 0; zoom--) {
      const testUrl = thumbnailUrl.replace(/zoom=\d+/, `zoom=${zoom}`);

      try {
        const res = await axios.head(testUrl);
        if (res.status === 200) {
          return testUrl;
        }
      } catch (error: unknown) {
        console.error(
          `Trying to get cover for ${bestMatch.volumeInfo.title} at zoom ${zoom} failed`,
          error,
        );
      }
    }

    return thumbnailUrl;
  }

  const rawThumbnail = bestMatch.volumeInfo.imageLinks?.thumbnail;
  const imageUrl = rawThumbnail ? await getBestCoverUrl(rawThumbnail) : null;

  return {
    title: bestMatch.volumeInfo.title,
    authors: bestMatch.volumeInfo.authors.map((author: string) => ({
      name: author,
    })),
    publishers: [
      {
        name: bestMatch.volumeInfo.publisher,
      },
    ],
    pageCount: bestMatch.volumeInfo.pageCount,
    description: bestMatch.volumeInfo.description,
    releaseDate: bestMatch.volumeInfo.publishedDate,
    imageUrl: imageUrl,
    attachments: [
      {
        type: "book",
        url: bestMatch.accessInfo.webReaderLink,
      },
    ],
  };
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
