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
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getSetting } from "./settings";
import { applyConsensus } from "@/lib/metadataConsensus";
import {
  replaceFieldEvidence,
  type FieldEvidenceInput,
} from "@/services/evidence";
import { fetchFromIGDB, getIGDBSuggestions } from "./igdb";
import { fetchFromHowLongToBeat } from "./howLongToBeat";
import { fetchFromMusicBrainz } from "./musicBrainz";
import { fetchFromSteamGridDB } from "./steamGridDb";
import { fetchMetadataFromPriceCharting } from "./priceCharting";
import { fetchFromDiscogs } from "./discogs";
import {
  gameExternalMetadataAdapters,
} from "@/services/providers/metadataGameExternalAdapters";
import { createMetadataCoreAdapters } from "@/services/providers/metadataCoreAdapters";
import {
  createBGGResolver,
  type BGGChild,
  type BGGResponse,
} from "@/services/providers/bggProvider";
import { createDeezerResolver } from "@/services/providers/deezerProvider";
import { createOpenLibraryResolver } from "@/services/providers/openLibraryProvider";
import { createOMDbResolver } from "@/services/providers/omdbProvider";
import { createRawgResolver } from "@/services/providers/rawgProvider";
import {
  createTMDBResolver,
  parseTMDBSeriesIntent,
} from "@/services/providers/tmdbProvider";
import {
  createScreenScraperResolver,
  pickSSCover,
} from "@/services/providers/screenScraperProvider";
import type {
  MetadataProviderAdapter,
} from "@/services/providers/types";
import {
  providersForType,
  type Capability,
  type MediaType,
  type ProviderInfo,
} from "./providerRegistry";

export interface MetadataAttachment {
  type: AttachmentType;
  title?: string;
  duration?: number;
  url: string;
  role?: string; // ex: "front", "back", "eu", "us"
  source?: string; // ex: "igdb", "screenscraper", "rawg"
}

export interface MetadataFact {
  kind: string;
  label: string;
  value: string;
  url?: string;
  unit?: string;
  source?: string;
  confidence?: number;
  priority?: number;
}

export interface MetadataResult {
  title?: string;
  platformKey?: string;
  authors?: { name: string; imageUrl?: string | null }[];
  publishers?: { name: string; imageUrl?: string | null }[];
  duration?: number;
  pageCount?: number;
  tracksCount?: number;
  description?: string;
  releaseDate?: string;
  imageUrl?: string;
  attachments?: MetadataAttachment[];
  aliases?: string[];
  regionalTitles?: { region?: string; text: string }[];
  facts?: MetadataFact[];
  fieldEvidence?: FieldEvidenceInput[];
  lastFetched?: string;
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
    role: attachment.role ?? undefined,
    source: attachment.source ?? undefined,
  })) ?? [];

function dedupeFacts(facts?: MetadataFact[]): MetadataFact[] | undefined {
  if (!facts || facts.length === 0) return undefined;
  const seen = new Set<string>();
  const normalizedFacts = normalizeMetadataFacts(applyConsensus(facts));
  const cleanFacts = normalizedFacts
    .filter((fact) => fact.label && fact.value)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const deduped: MetadataFact[] = [];
  for (const fact of cleanFacts) {
    const key = `${fact.kind}:${fact.label}:${fact.value}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(fact);
  }

  return deduped.length > 0 ? deduped : undefined;
}

function normalizeMetadataFacts(facts: MetadataFact[]): MetadataFact[] {
  const gameClassificationLabels = new Set([
    "PEGI",
    "ESRB",
    "CERO",
    "USK",
    "GRAC",
    "CLASS_IND",
    "ACB",
  ]);
  const normalized = facts.flatMap((fact) => {
    if (fact.kind !== "age-rating") return [fact];

    const label = fact.label.replace(/^Classification\s+/i, "").trim();
    if (
      gameClassificationLabels.has(label) &&
      label !== "PEGI" &&
      label !== "ESRB"
    ) {
      return [];
    }

    const defaultPriority = label === "PEGI" ? 100 : 60;
    return [
      {
        ...fact,
        label,
        priority: Math.max(fact.priority ?? 0, defaultPriority),
      },
    ];
  });

  const pickBestRating = (label: string) =>
    normalized
      .filter((fact) => fact.kind === "age-rating" && fact.label === label)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];

  const pegi = pickBestRating("PEGI");
  const esrb = pickBestRating("ESRB");

  return normalized.filter((fact) => {
    if (fact.kind !== "age-rating") return true;
    if (!gameClassificationLabels.has(fact.label)) return true;
    if (pegi) return fact === pegi;
    return esrb ? fact === esrb : false;
  });
}

function cleanEvidenceText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function fieldForFact(fact: MetadataFact) {
  if (fact.kind === "rating") return "rating";
  if (fact.kind === "age-rating") return "ageRating";
  if (
    fact.kind === "time-to-beat" ||
    fact.kind === "duration" ||
    fact.kind === "completion-time"
  ) {
    return "timeToBeat";
  }
  return fact.label ? `${fact.kind}:${fact.label}` : fact.kind;
}

function fieldForAttachment(attachment: MetadataAttachment) {
  if (attachment.type === "cover") return "cover";
  return `attachment:${attachment.type}`;
}

function pushEvidence(
  evidence: FieldEvidenceInput[],
  input: FieldEvidenceInput,
) {
  const value = cleanEvidenceText(input.value);
  if (!value || !input.field || !input.source) return;
  evidence.push({
    ...input,
    value,
  });
}

function metadataFieldEvidence(
  source: string,
  metadata: MetadataResult | null | undefined,
  options: { confidence?: number; priority?: number } = {},
): FieldEvidenceInput[] {
  if (!metadata) return [];
  const evidence: FieldEvidenceInput[] = [];
  const base = {
    source,
    confidence: options.confidence,
    priority: options.priority,
  };

  pushEvidence(evidence, {
    ...base,
    field: "title",
    value: metadata.title || "",
  });
  pushEvidence(evidence, {
    ...base,
    field: "description",
    value: metadata.description || "",
  });
  pushEvidence(evidence, {
    ...base,
    field: "releaseDate",
    value: metadata.releaseDate || "",
  });
  pushEvidence(evidence, {
    ...base,
    field: "imageUrl",
    value: metadata.imageUrl || "",
    sourceUrl: metadata.imageUrl,
  });
  pushEvidence(evidence, {
    ...base,
    field: "duration",
    value: metadata.duration?.toString() || "",
  });
  pushEvidence(evidence, {
    ...base,
    field: "pageCount",
    value: metadata.pageCount?.toString() || "",
  });
  pushEvidence(evidence, {
    ...base,
    field: "tracksCount",
    value: metadata.tracksCount?.toString() || "",
  });

  for (const author of metadata.authors || []) {
    pushEvidence(evidence, {
      ...base,
      field: "author",
      value: author.name,
      rawValue: author,
      sourceUrl: author.imageUrl || undefined,
    });
  }

  for (const publisher of metadata.publishers || []) {
    pushEvidence(evidence, {
      ...base,
      field: "publisher",
      value: publisher.name,
      rawValue: publisher,
      sourceUrl: publisher.imageUrl || undefined,
    });
  }

  for (const alias of metadata.aliases || []) {
    pushEvidence(evidence, {
      ...base,
      field: "alias",
      value: alias,
      rawValue: { alias },
    });
  }

  for (const regionalTitle of metadata.regionalTitles || []) {
    pushEvidence(evidence, {
      ...base,
      field: "regionalTitle",
      value: regionalTitle.text,
      region: regionalTitle.region,
      rawValue: regionalTitle,
    });
  }

  for (const fact of metadata.facts || []) {
    pushEvidence(evidence, {
      source: fact.source || source,
      field: fieldForFact(fact),
      value: fact.value,
      confidence: fact.confidence ?? options.confidence,
      priority: fact.priority ?? options.priority,
      sourceUrl: fact.url,
      rawValue: fact,
    });
  }

  for (const attachment of metadata.attachments || []) {
    pushEvidence(evidence, {
      source: attachment.source || source,
      field: fieldForAttachment(attachment),
      value: attachment.url,
      sourceUrl: attachment.url,
      rawValue: attachment,
      priority: options.priority,
    });
  }

  return evidence;
}

function dedupeFieldEvidence(
  evidence: FieldEvidenceInput[],
): FieldEvidenceInput[] {
  const seen = new Set<string>();
  const output: FieldEvidenceInput[] = [];
  for (const item of evidence) {
    const key = [
      item.field,
      item.source,
      item.value,
      item.sourceUrl || "",
      item.region || "",
    ]
      .join("\u0000")
      .toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function withProviderEvidence(
  metadata: MetadataResult | null,
  source: string,
): MetadataResult | null {
  if (!metadata) return null;
  const providerEvidence = metadataFieldEvidence(source, metadata);
  return {
    ...metadata,
    fieldEvidence: dedupeFieldEvidence([
      ...(metadata.fieldEvidence || []),
      ...providerEvidence,
    ]),
  };
}

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
    aliases: metadata.aliases ? JSON.stringify(metadata.aliases) : null,
    facts: dedupeFacts(metadata.facts)
      ? JSON.stringify(dedupeFacts(metadata.facts))
      : null,
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
  let aliases: string[] = [];
  if (metadata.aliases) {
    try {
      aliases = JSON.parse(metadata.aliases);
    } catch (e) {
      console.error("Failed to parse aliases from storage:", e);
    }
  }

  let facts: MetadataFact[] = [];
  if (metadata.facts) {
    try {
      const parsed = JSON.parse(metadata.facts);
      facts = Array.isArray(parsed)
        ? normalizeMetadataFacts(applyConsensus(parsed))
        : [];
    } catch (e) {
      console.error("Failed to parse facts from storage:", e);
    }
  }

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
    aliases: aliases.length > 0 ? aliases : undefined,
    facts: facts.length > 0 ? facts : undefined,
    lastFetched: metadata.lastFetched
      ? new Date(metadata.lastFetched).toISOString()
      : undefined,
  };
}

export async function getMetadata(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  try {
    const metadata = await fetchMetadataByType(name, type, barcode, platform);

    if (metadata && barcode) {
      const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
      if (cleanedBarcode) {
        const cached = await prisma.barcodeCache.findUnique({
          where: { barcode: cleanedBarcode },
          include: { rawNames: true },
        });

        if (cached) {
          const barcodeCover = cached.rawNames.find(
            (rn) => rn.coverUrl,
          )?.coverUrl;
          if (barcodeCover) {
            if (!metadata.attachments) {
              metadata.attachments = [];
            }
            const exists = metadata.attachments.some(
              (a) => a.url === barcodeCover,
            );
            if (!exists) {
              metadata.attachments.unshift({
                type: "cover" as AttachmentType,
                url: barcodeCover,
                source: "barcode",
              });
            }
          }
        }
      }
    }

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
  platform?: string | null,
): Promise<MetadataResult | null> {
  // Check if we should use cached metadata
  if (!forceRefresh) {
    const cachedMetadata = await getCachedMetadata(itemId);
    if (cachedMetadata) {
      return formatMetadataFromStorage(cachedMetadata);
    }
  }

  // Fetch new metadata using the name for lookup only
  const metadata = await getMetadata(name, type, barcode, platform);
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

export async function downloadRemoteImage(url: string): Promise<string | null> {
  if (
    !url ||
    url.startsWith("/") ||
    url.startsWith("file://") ||
    !url.startsWith("http")
  ) {
    return url;
  }

  try {
    const hash = crypto.createHash("md5").update(url).digest("hex");
    let ext = ".jpg";
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const pathExt = path.extname(pathname);
    if (
      pathExt &&
      [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(
        pathExt.toLowerCase(),
      )
    ) {
      ext = pathExt;
    }

    const filename = `${hash}${ext}`;
    const targetDir = path.join(process.cwd(), "public", "uploads");
    const targetPath = path.join(targetDir, filename);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (fs.existsSync(targetPath)) {
      return `/uploads/${filename}`;
    }

    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (res.status === 200) {
      fs.writeFileSync(targetPath, Buffer.from(res.data));
      console.log(`[ImageLocalizer] Downloaded ${url} -> ${targetPath}`);
      return `/uploads/${filename}`;
    }
  } catch (err: any) {
    console.error(
      `[ImageLocalizer] Failed to download image from ${url}:`,
      err.message,
    );
  }

  return null;
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
  if (metadata.imageUrl) {
    const localized = await downloadRemoteImage(metadata.imageUrl);
    metadata.imageUrl = localized || undefined;
  }

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

  const attachmentsList = [...(metadata.attachments || [])];
  if (item?.barcode) {
    const cleanedBarcode = item.barcode.replace(/[^\d]/g, "").trim();
    if (cleanedBarcode) {
      const cached = await prisma.barcodeCache.findUnique({
        where: { barcode: cleanedBarcode },
        include: { rawNames: true },
      });
      if (cached) {
        const barcodeCover = cached.rawNames.find(
          (rn) => rn.coverUrl,
        )?.coverUrl;
        if (barcodeCover) {
          const exists = attachmentsList.some((a) => a.url === barcodeCover);
          if (!exists) {
            attachmentsList.unshift({
              type: "cover" as AttachmentType,
              url: barcodeCover,
              source: "barcode",
            });
          }
        }
      }
    }
  }

  // Deduplicate attachments by URL
  const uniqueAttachments = attachmentsList.filter(
    (attachment, index, self) =>
      index === self.findIndex((a) => a.url === attachment.url),
  );

  // Localize all attachments before database save, filtering out failures (e.g. 404)
  const localizedAttachments = (
    await Promise.all(
      uniqueAttachments.map(async (attachment) => {
        const localizedUrl = await downloadRemoteImage(attachment.url);
        if (!localizedUrl) return null;
        return {
          ...attachment,
          url: localizedUrl,
        };
      }),
    )
  ).filter((a): a is NonNullable<typeof a> => a !== null);

  const metadataData = {
    ...formattedMetadata,
    lastFetched: now,
    updatedAt: now,
  };

  let storedMetadata: Metadata & {
    attachments?: Attachment[];
    authors?: Author[];
    publishers?: Publisher[];
  };

  if (item?.metadata) {
    // Delete existing attachments
    await prisma.attachment.deleteMany({
      where: { metadataId: item.metadata.id },
    });

    // Update existing metadata with new authors and publishers
    storedMetadata = await prisma.metadata.update({
      where: { id: item.metadata.id },
      data: {
        ...metadataData,
        attachments: {
          create: localizedAttachments,
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
    storedMetadata = await prisma.metadata.create({
      data: {
        ...metadataData,
        items: {
          connect: { id: itemId },
        },
        attachments: {
          create: localizedAttachments,
        },
      },
      include: { attachments: true, authors: true, publishers: true },
    });
  }

  const evidence =
    metadata.fieldEvidence && metadata.fieldEvidence.length > 0
      ? metadata.fieldEvidence
      : metadataFieldEvidence("MergedEngine", metadata, {
          confidence: 0.72,
          priority: 100,
        });

  await replaceFieldEvidence(
    {
      itemId,
      metadataId: storedMetadata.id,
    },
    evidence,
  );

  return storedMetadata;
}

async function fetchMetadataByType(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  if (type === "games") {
    return fetchFromAllGameSources(name, barcode, platform);
  }
  if (type === "movies") {
    return fetchFromAllMovieSources(name, barcode, platform);
  }
  return fetchFromRegistryMetadataResolvers(name, type, barcode, platform);
}

const metadataProviderAdapters: MetadataProviderAdapter[] = [
  ...gameExternalMetadataAdapters,
  {
    id: "musicbrainz",
    async resolve({ barcode }) {
      if (!barcode) return null;
      const mb = await fetchFromMusicBrainz(barcode);
      if (!mb?.title) return null;

      const facts: MetadataFact[] = [];
      if (mb.country) {
        facts.push({
          kind: "release-region",
          label: "Pays",
          value: mb.country,
          source: "musicbrainz",
          confidence: 0.7,
          priority: 35,
        });
      }
      if (mb.status) {
        facts.push({
          kind: "release-status",
          label: "Statut",
          value: mb.status,
          source: "musicbrainz",
          confidence: 0.68,
          priority: 34,
        });
      }
      if (mb.packaging) {
        facts.push({
          kind: "format",
          label: "Packaging",
          value: mb.packaging,
          source: "musicbrainz",
          confidence: 0.67,
          priority: 33,
        });
      }
      if (mb.label) {
        facts.push({
          kind: "label",
          label: "Label",
          value: mb.label,
          source: "musicbrainz",
          confidence: 0.7,
          priority: 42,
        });
      }
      if (mb.format) {
        facts.push({
          kind: "format",
          label: "Support",
          value: mb.format,
          source: "musicbrainz",
          confidence: 0.66,
          priority: 31,
        });
      }

      return {
        title: mb.title,
        releaseDate: mb.releaseDate || undefined,
        authors: mb.artist ? [{ name: mb.artist }] : [],
        tracksCount: mb.tracksCount || undefined,
        imageUrl: mb.imageUrl || undefined,
        facts: facts.length > 0 ? facts : undefined,
      };
    },
  },
  {
    id: "discogs",
    async resolve({ barcode }) {
      if (!barcode) return null;
      const discogs = await fetchFromDiscogs(barcode);
      if (!discogs?.title) return null;

      const facts: MetadataFact[] = [];
      if (discogs.country) {
        facts.push({
          kind: "release-region",
          label: "Pays",
          value: discogs.country,
          source: "discogs",
          confidence: 0.68,
          priority: 35,
        });
      }
      if (discogs.format) {
        facts.push({
          kind: "format",
          label: "Support",
          value: discogs.format,
          source: "discogs",
          confidence: 0.7,
          priority: 40,
        });
      }
      if (discogs.label) {
        facts.push({
          kind: "label",
          label: "Label",
          value: discogs.label,
          source: "discogs",
          confidence: 0.7,
          priority: 41,
        });
      }
      if (discogs.genres && discogs.genres.length > 0) {
        facts.push({
          kind: "genre",
          label: "Genres",
          value: discogs.genres.slice(0, 3).join(" • "),
          source: "discogs",
          confidence: 0.66,
          priority: 38,
        });
      }
      if (discogs.styles && discogs.styles.length > 0) {
        facts.push({
          kind: "style",
          label: "Styles",
          value: discogs.styles.slice(0, 3).join(" • "),
          source: "discogs",
          confidence: 0.65,
          priority: 37,
        });
      }

      const releaseDate =
        discogs.year && /^\d{4}$/.test(discogs.year)
          ? `${discogs.year}-01-01`
          : undefined;

      return {
        title: discogs.title,
        releaseDate,
        imageUrl: discogs.imageUrl || undefined,
        facts: facts.length > 0 ? facts : undefined,
      };
    },
  },
  ...createMetadataCoreAdapters({
    fetchFromScreenScraper: async (name, barcode, platform) =>
      (await fetchFromScreenScraper(
        name,
        barcode,
        platform,
      )) as MetadataResult | null,
    fetchFromRawg: async (name) => (await fetchFromRawg(name)) as MetadataResult | null,
    fetchFromDeezer: async (name, barcode) =>
      (await fetchFromDeezer(name, barcode)) as MetadataResult | null,
    fetchFromBGG: async (name) => (await fetchFromBGG(name)) as MetadataResult | null,
    fetchFromOpenLibrary: async (name, barcode) =>
      (await fetchFromOpenLibrary(name, barcode)) as MetadataResult | null,
    fetchFromTMDB: async (name) => (await fetchFromTMDB(name)) as MetadataResult | null,
    fetchFromOMDb: async (name) => (await fetchFromOMDb(name)) as MetadataResult | null,
  }),
];

const metadataProviderResolverMap = new Map(
  metadataProviderAdapters.map((adapter) => [adapter.id, adapter]),
);

const metadataSelectionCapabilities: Capability[] = [
  "identify",
  "description",
  "cover",
  "releaseDate",
  "rating",
  "ageRating",
  "people",
  "duration",
];

function isMediaType(value: string): value is MediaType {
  return ["games", "movies", "musics", "books", "boardgames"].includes(value);
}

function metadataCandidatesForType(type: MediaType): ProviderInfo[] {
  return providersForType(type)
    .filter(
      (provider) =>
        provider.canonical ||
        provider.capabilities.some((capability) =>
          metadataSelectionCapabilities.includes(capability),
        ),
    )
    .sort((a, b) => Number(b.canonical) - Number(a.canonical));
}

function orderedProviderIdsForType(
  type: MediaType,
  preferredOrder: string[],
): string[] {
  const available = new Set(metadataCandidatesForType(type).map((p) => p.id));
  return preferredOrder.filter((id) => available.has(id));
}

async function fetchFromRegistryMetadataResolvers(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  if (!isMediaType(type)) return null;
  for (const provider of metadataCandidatesForType(type)) {
    const adapter = metadataProviderResolverMap.get(provider.id);
    if (!adapter) continue;
    const metadata = await adapter.resolve({ name, barcode, platform });
    if (metadata) {
      return withProviderEvidence(metadata, provider.label);
    }
  }
  return null;
}

/**
 * Multi-source game metadata aggregator.
 * Runs IGDB, ScreenScraper, HLTB, Steam, RAWG and optional artwork/catalog
 * providers in parallel and merges their results:
 *   - ScreenScraper: best for physical box art covers (scanned)
 *   - IGDB: best for descriptions, screenshots, artworks (HD)
 *   - HowLongToBeat: direct playtime enrichment when IGDB has no HLTB data
 *   - Steam: useful enrichment facts, store art and reference links
 *   - SteamGridDB: rich community artwork fallback
 *   - RAWG: fallback when both above are unconfigured / return nothing
 */
async function fetchFromAllGameSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  const includePcSources = isPcLikeGamePlatform(platform);
  const gameProviderOrder = [
    "igdb",
    "screenscraper",
    "howlongtobeat",
    "steam",
    "rawg",
    "steamgriddb",
  ];
  const selectedProviderIds = orderedProviderIdsForType("games", gameProviderOrder);
  const settled = await Promise.allSettled(
    selectedProviderIds.map(async (providerId) => ({
      providerId,
      value: await metadataProviderResolverMap
        .get(providerId)
        ?.resolve({ name, barcode, platform, includePcSources }),
    })),
  );
  const byProvider = new Map<string, MetadataResult | null>();
  for (const item of settled) {
    if (item.status !== "fulfilled") continue;
    byProvider.set(item.value.providerId, item.value.value || null);
  }

  let igdb = byProvider.get("igdb") || null;
  let ss = byProvider.get("screenscraper") || null;
  let hltb = byProvider.get("howlongtobeat") || null;
  const steam = byProvider.get("steam") || null;
  let rawg = byProvider.get("rawg") || null;
  let steamGrid = byProvider.get("steamgriddb") || null;
  let pcMeta = null as Awaited<
    ReturnType<typeof fetchMetadataFromPriceCharting>
  > | null;

  if (barcode) {
    try {
      pcMeta = await fetchMetadataFromPriceCharting(barcode, name, platform || undefined);
    } catch (error) {
      console.warn("[PriceCharting] metadata enrichment failed", error);
    }
  }

  let canonicalFallbackNames = collectCanonicalFallbackNames(name, [
    igdb,
    ss,
    rawg,
    steam,
    steamGrid,
  ]);

  if (!ss) {
    for (const fallbackName of canonicalFallbackNames.slice(0, 12)) {
      ss = await fetchFromScreenScraper(fallbackName, barcode, platform);
      if (ss) break;
    }
  }

  if (!igdb) {
    for (const fallbackName of canonicalFallbackNames.slice(0, 12)) {
      igdb = await fetchFromIGDB(fallbackName, platform);
      if (igdb) break;
    }
  }

  canonicalFallbackNames = collectCanonicalFallbackNames(name, [
    igdb,
    ss,
    rawg,
    steam,
    steamGrid,
  ]);

  if (ss && shouldRecheckScreenScraperMatch(name, ss, canonicalFallbackNames)) {
    const improved = await findBetterScreenScraperMatch(
      name,
      ss,
      canonicalFallbackNames,
      barcode,
      platform,
    );
    if (improved) ss = improved;
  }

  const rawgComparisonNames = collectCanonicalFallbackNames(name, [ss, igdb]);
  const hasRawgRating = rawg?.facts?.some((fact) => fact.kind === "rating");
  const rawgLooksMismatched =
    rawg &&
    rawg.title &&
    rawgComparisonNames.length > 0 &&
    !isMetadataTitleAligned(rawg, rawgComparisonNames, 0.58);

  if (!rawg || !hasRawgRating || rawgLooksMismatched) {
    for (const fallbackName of canonicalFallbackNames.slice(0, 12)) {
      const fallbackRawg = await fetchFromRawg(fallbackName);
      if (
        fallbackRawg?.facts?.some((fact) => fact.kind === "rating") &&
        isMetadataTitleAligned(
          fallbackRawg,
          [fallbackName, ...rawgComparisonNames],
          0.58,
        )
      ) {
        rawg = fallbackRawg;
        break;
      }
    }
  }

  if (!steamGrid) {
    for (const fallbackName of canonicalFallbackNames.slice(0, 12)) {
      steamGrid = await fetchFromSteamGridDB(fallbackName);
      if (steamGrid) break;
    }
  }

  if (!hltb) {
    for (const fallbackName of canonicalFallbackNames.slice(0, 12)) {
      hltb = await fetchFromHowLongToBeat(fallbackName, platform);
      if (hltb) break;
    }
  }

  // If all failed, return null
  if (!igdb && !ss && !hltb && !steam && !rawg && !steamGrid) {
    return null;
  }

  const providerEvidence = dedupeFieldEvidence([
    ...metadataFieldEvidence("IGDB", igdb),
    ...metadataFieldEvidence("ScreenScraper", ss),
    ...metadataFieldEvidence("HowLongToBeat", hltb),
    ...(includePcSources ? metadataFieldEvidence("Steam", steam) : []),
    ...metadataFieldEvidence("RAWG", rawg),
    ...metadataFieldEvidence("SteamGridDB", steamGrid),
  ]);
  const merged = mergeGameMetadata(igdb, ss, hltb, steam, rawg, steamGrid, {
    includePcSources,
  });
  const pcFacts: MetadataFact[] = [];
  if (pcMeta?.ageRating) {
    pcFacts.push({
      kind: "age-rating",
      label: pcMeta.ageRating.startsWith("PEGI") ? "PEGI" : "PriceCharting",
      value: pcMeta.ageRating.replace(/^PEGI\s*/i, "").trim() || pcMeta.ageRating,
      source: "pricecharting",
      confidence: 0.62,
      priority: 58,
    });
  }
  const mergedWithEvidence = {
    ...merged,
    facts: dedupeFacts([...(merged.facts || []), ...pcFacts]),
    fieldEvidence: dedupeFieldEvidence([
      ...providerEvidence,
      ...metadataFieldEvidence("MergedEngine", merged, {
        confidence: 0.8,
        priority: 200,
      }),
    ]),
  };

  return preferRequestedDisplayTitle(mergedWithEvidence, name);
}

async function fetchFromAllMovieSources(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  const [tmdb, omdb] = await Promise.all([
    metadataProviderResolverMap.get("tmdb")?.resolve({ name, barcode, platform }),
    metadataProviderResolverMap.get("omdb")?.resolve({ name, barcode, platform }),
  ]);

  if (!tmdb && !omdb) return null;

  const base = tmdb || omdb!;
  const merged: MetadataResult = {
    ...base,
    facts: dedupeFacts([...(tmdb?.facts || []), ...(omdb?.facts || [])]),
    fieldEvidence: dedupeFieldEvidence([
      ...metadataFieldEvidence("TMDB", tmdb),
      ...metadataFieldEvidence("OMDb", omdb),
      ...metadataFieldEvidence("MergedEngine", base, {
        confidence: 0.76,
        priority: 190,
      }),
    ]),
  };

  return preferRequestedDisplayTitle(merged, name);
}

function collectCanonicalFallbackNames(
  requestedName: string,
  sources: Array<MetadataResult | null | undefined>,
): string[] {
  const requestedKey = cleanSearchQuery(requestedName).toLowerCase();

  return Array.from(
    new Set(
      [
        ...buildRequestedTitleFallbackVariants(requestedName),
        ...sources.flatMap((source) => [
          source?.title,
          ...(source?.aliases || []),
        ]),
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .filter(
          (value) => cleanSearchQuery(value).toLowerCase() !== requestedKey,
        ),
    ),
  );
}

function buildRequestedTitleFallbackVariants(requestedName: string): string[] {
  const variants: string[] = [];
  const normalized = requestedName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/\bstar\s+wars\b/.test(normalized)) {
    const forceUnleashedNumber = normalized.match(
      /\ble\s+pouvoir\s+de\s+la\s+force\b.*\b(ii|2)\b/,
    );
    if (forceUnleashedNumber) {
      variants.push(
        "Star Wars: The Force Unleashed II",
        "Star Wars: The Force Unleashed 2",
      );
    } else if (/\ble\s+pouvoir\s+de\s+la\s+force\b/.test(normalized)) {
      variants.push("Star Wars: The Force Unleashed");
    }
  }

  variants.push(
    requestedName.replace(/\bII\b/g, "2"),
    requestedName.replace(/\bIII\b/g, "3"),
    requestedName.replace(/\bIV\b/g, "4"),
    requestedName.replace(/\b2\b/g, "II"),
    requestedName.replace(/\b3\b/g, "III"),
    requestedName.replace(/\b4\b/g, "IV"),
  );

  return variants;
}

function metadataTitleSimilarity(a: string, b: string): number {
  const aTokens = normalizeDisplayTitle(a);
  const bTokens = normalizeDisplayTitle(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  if (aTokens.join(" ") === bTokens.join(" ")) return 1;

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  const shared = [...aSet].filter((token) => bSet.has(token)).length;
  const tokenScore = shared / Math.max(aSet.size, bSet.size);
  const normalizedA = aTokens.join(" ");
  const normalizedB = bTokens.join(" ");
  const distanceScore =
    1 -
    levenshtein.get(normalizedA, normalizedB) /
      Math.max(normalizedA.length, normalizedB.length);

  return Math.max(tokenScore, distanceScore);
}

function hasUnrequestedTrailingQualifier(
  requestedName: string,
  resultTitle: string,
): boolean {
  const segments = resultTitle
    .split(/\s*[:\-–—]\s*/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return false;

  const requestedTokens = new Set(normalizeDisplayTitle(requestedName));
  const trailingTokens = normalizeDisplayTitle(segments[segments.length - 1]);
  if (trailingTokens.length === 0) return false;

  return trailingTokens.every((token) => !requestedTokens.has(token));
}

function screenScraperMatchScore(
  result: MetadataResult,
  comparisonNames: string[],
): number {
  const title = result.title || "";
  if (!title) return 0;

  return comparisonNames.reduce(
    (bestScore, comparisonName) =>
      Math.max(bestScore, metadataTitleSimilarity(title, comparisonName)),
    0,
  );
}

function isMetadataTitleAligned(
  result: MetadataResult,
  comparisonNames: string[],
  minScore: number,
): boolean {
  if (!result.title) return true;
  return screenScraperMatchScore(result, comparisonNames) >= minScore;
}

function shouldRecheckScreenScraperMatch(
  requestedName: string,
  ss: MetadataResult,
  canonicalFallbackNames: string[],
): boolean {
  if (!ss.title || canonicalFallbackNames.length === 0) return false;

  if (hasUnrequestedTrailingQualifier(requestedName, ss.title)) {
    return true;
  }

  const comparisonNames = [requestedName, ...canonicalFallbackNames];
  return screenScraperMatchScore(ss, comparisonNames) < 0.64;
}

function isBetterScreenScraperMatch(
  requestedName: string,
  current: MetadataResult,
  candidate: MetadataResult,
  canonicalFallbackNames: string[],
): boolean {
  if (!candidate.title) return false;
  const comparisonNames = [requestedName, ...canonicalFallbackNames];
  const currentScore = screenScraperMatchScore(current, comparisonNames);
  const candidateScore = screenScraperMatchScore(candidate, comparisonNames);
  const currentHasExtraQualifier = current.title
    ? hasUnrequestedTrailingQualifier(requestedName, current.title)
    : false;
  const candidateHasExtraQualifier = hasUnrequestedTrailingQualifier(
    requestedName,
    candidate.title,
  );

  if (candidateHasExtraQualifier && !currentHasExtraQualifier) return false;
  if (candidateScore >= currentScore + 0.08) return true;

  return (
    currentHasExtraQualifier &&
    !candidateHasExtraQualifier &&
    candidateScore >= 0.62
  );
}

async function findBetterScreenScraperMatch(
  requestedName: string,
  current: MetadataResult,
  canonicalFallbackNames: string[],
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  const currentKey = cleanSearchQuery(current.title || "").toLowerCase();
  const candidates = canonicalFallbackNames.filter(
    (fallbackName) =>
      cleanSearchQuery(fallbackName).toLowerCase() !== currentKey,
  );

  for (const fallbackName of candidates.slice(0, 12)) {
    const candidate = await fetchFromScreenScraper(
      fallbackName,
      barcode,
      platform,
    );
    if (
      candidate &&
      isBetterScreenScraperMatch(
        requestedName,
        current,
        candidate,
        canonicalFallbackNames,
      )
    ) {
      return candidate;
    }
  }

  return null;
}

function isPcLikeGamePlatform(platform?: string | null): boolean {
  if (!platform) return false;
  const normalized = platform
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(pc|windows|steam)\b/.test(normalized);
}

function formatScore(value: number, max: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const maximumFractionDigits = max <= 10 ? 1 : 0;
  return `${value.toLocaleString("fr-FR", {
    maximumFractionDigits,
  })}/${max}`;
}

/**
 * Merges game metadata results with clear priority rules per field.
 */
function mergeGameMetadata(
  igdb: MetadataResult | null,
  ss: MetadataResult | null,
  hltb: MetadataResult | null,
  steam: MetadataResult | null,
  rawg: MetadataResult | null,
  steamGrid: MetadataResult | null,
  options: { includePcSources?: boolean } = {},
): MetadataResult {
  // Title: ScreenScraper (physical, region-aware) > IGDB > RAWG
  const title =
    ss?.title || igdb?.title || rawg?.title || steam?.title || steamGrid?.title;

  // Description: IGDB tends to be richer than ScreenScraper / RAWG.
  const description =
    igdb?.description ||
    ss?.description ||
    rawg?.description ||
    steam?.description;

  // Release date: IGDB > ScreenScraper > RAWG
  const releaseDate = igdb?.releaseDate || ss?.releaseDate || rawg?.releaseDate;

  // Publishers: merge all lists, deduplicated by name
  const allPublishers = [
    ...(igdb?.publishers || []),
    ...(ss?.publishers || []),
    ...(rawg?.publishers || []),
    ...(steam?.publishers || []),
  ];
  const publishers =
    allPublishers.length > 0
      ? allPublishers.filter(
          (p, i, arr) => arr.findIndex((q) => q.name === p.name) === i,
        )
      : undefined;

  // imageUrl: prefer physical scans, then catalog covers/artwork.
  const imageUrl =
    ss?.imageUrl ||
    igdb?.imageUrl ||
    rawg?.imageUrl ||
    steamGrid?.imageUrl ||
    steam?.imageUrl;

  // Attachments: merge all, ordering:
  //   1. Covers from ScreenScraper (physical scans, highest priority)
  //   2. Covers from RAWG / CoverProject physical fallbacks
  //   3. Covers from IGDB / SteamGridDB / Steam
  //   4. Screenshots from IGDB, ScreenScraper, RAWG/Steam
  //   5. Artworks/backgrounds/logos
  //   6. Everything else
  const ssAttachments = (ss?.attachments || []).map((a) => ({
    ...a,
    source: a.source || "screenscraper",
  }));
  const igdbAttachments = (igdb?.attachments || []).map((a) => ({
    ...a,
    source: a.source || "igdb",
  }));
  const rawgAttachments = (rawg?.attachments || []).map((a) => ({
    ...a,
    source: a.source || "rawg",
  }));
  const steamAttachments = (
    options.includePcSources ? steam?.attachments || [] : []
  ).map((a) => ({
    ...a,
    source: a.source || "steam",
  }));
  const steamGridAttachments = (steamGrid?.attachments || []).map((a) => ({
    ...a,
    source: a.source || "steamgriddb",
  }));

  const ssCovers = ssAttachments.filter((a) => a.type === "cover");
  const igdbCovers = igdbAttachments.filter((a) => a.type === "cover");
  const rawgCovers = rawgAttachments.filter((a) => a.type === "cover");
  const steamGridCovers = steamGridAttachments.filter(
    (a) => a.type === "cover",
  );
  const steamCovers = steamAttachments.filter((a) => a.type === "cover");

  const igdbScreenshots = igdbAttachments.filter(
    (a) => a.type === "screenshot",
  );
  const ssScreenshots = ssAttachments.filter((a) => a.type === "screenshot");
  const rawgScreenshots = rawgAttachments.filter(
    (a) => a.type === "screenshot",
  );
  const steamScreenshots = steamAttachments.filter(
    (a) => a.type === "screenshot",
  );

  const igdbArtworks = igdbAttachments.filter((a) => a.type === "artwork");
  const steamGridArtworks = steamGridAttachments.filter(
    (a) => a.type === "artwork" || a.type === "background" || a.type === "logo",
  );
  const steamArtworks = steamAttachments.filter(
    (a) => a.type === "artwork" || a.type === "background",
  );

  const ssOther = ssAttachments.filter(
    (a) => a.type !== "cover" && a.type !== "screenshot",
  );
  const igdbOther = igdbAttachments.filter(
    (a) =>
      a.type !== "cover" && a.type !== "screenshot" && a.type !== "artwork",
  );
  const rawgOther = rawgAttachments.filter(
    (a) => a.type !== "cover" && a.type !== "screenshot",
  );
  const steamOther = steamAttachments.filter(
    (a) =>
      a.type !== "cover" &&
      a.type !== "screenshot" &&
      a.type !== "artwork" &&
      a.type !== "background",
  );
  const steamGridOther = steamGridAttachments.filter(
    (a) =>
      a.type !== "cover" &&
      a.type !== "artwork" &&
      a.type !== "background" &&
      a.type !== "logo",
  );

  const allAttachments: MetadataAttachment[] = [
    ...ssCovers,
    ...igdbCovers,
    ...rawgCovers,
    ...steamGridCovers,
    ...steamCovers,
    ...igdbScreenshots,
    ...ssScreenshots,
    ...rawgScreenshots,
    ...steamScreenshots,
    ...igdbArtworks,
    ...steamGridArtworks,
    ...steamArtworks,
    ...ssOther,
    ...igdbOther,
    ...rawgOther,
    ...steamGridOther,
    ...steamOther,
  ];

  // Deduplicate by URL
  const seen = new Set<string>();
  const attachments = allAttachments.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  const allAliases = Array.from(
    new Set([
      ...(igdb?.aliases || []),
      ...(ss?.aliases || []),
      ...(hltb?.aliases || []),
      ...(rawg?.aliases || []),
      ...(steam?.aliases || []),
      ...(steamGrid?.aliases || []),
    ]),
  ).filter((a) => a.toLowerCase().trim() !== title?.toLowerCase().trim());
  const aliases = allAliases.length > 0 ? allAliases : undefined;
  const hltbFacts = hltb?.facts || [];
  const hasDirectTimeToBeat = hltbFacts.some(
    (fact) =>
      fact.kind === "time-to-beat" ||
      fact.kind === "duration" ||
      fact.kind === "completion-time",
  );
  const igdbFacts = (igdb?.facts || []).filter(
    (fact) => !hasDirectTimeToBeat || fact.kind !== "time-to-beat",
  );
  const facts = dedupeFacts([
    ...igdbFacts,
    ...(ss?.facts || []),
    ...hltbFacts,
    ...(rawg?.facts || []),
    ...(options.includePcSources ? steam?.facts || [] : []),
  ]);

  return {
    title,
    description,
    releaseDate,
    publishers,
    imageUrl,
    attachments,
    aliases,
    facts,
  };
}

function normalizeDisplayTitle(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length > 2 &&
        !["and", "the", "aux", "des", "les", "une", "pour"].includes(token),
    );
}

function areDisplayTitlesSameProduct(a: string, b: string): boolean {
  const aTokens = normalizeDisplayTitle(a);
  const bTokens = normalizeDisplayTitle(b);
  if (aTokens.length === 0 || bTokens.length === 0) return false;

  const shared = aTokens.filter((token) => bTokens.includes(token));
  return shared.length >= Math.min(2, Math.min(aTokens.length, bTokens.length));
}

function scoreMetadataDisplayTitle(title: string): number {
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  let score = 0;

  if (title.includes("&")) score += 45;
  if (/[éèàùçêâôîëïüû]/i.test(title)) score += 25;
  if (
    /\b(le|la|les|un|une|des|du|de|en|et|pour|sur|au|aux|avec|sans|dans)\b/.test(
      normalized,
    )
  ) {
    score += 40;
  }
  if (/\bjeux?\s+olympiques?\b/.test(normalized)) score += 120;
  if (
    /\band\b/.test(title) &&
    /\b(aux|jeux?|olympiques?|hiver)\b/.test(normalized)
  ) {
    score -= 20;
  }
  if (/\b(19|20)\d{2}\b/.test(normalized)) score -= 60;
  if (
    /\b(nintendo|playstation|xbox|wii|wiisc|switch|sega|notice|manuale|complet|complete|completo|pal|fra|ita)\b/.test(
      normalized,
    )
  ) {
    score -= 120;
  }

  return score;
}

function preferRequestedDisplayTitle(
  metadata: MetadataResult,
  requestedName: string,
): MetadataResult {
  const currentTitle = metadata.title;
  const requestedTitle = requestedName.trim();

  if (
    !currentTitle ||
    !requestedTitle ||
    currentTitle.toLowerCase().trim() === requestedTitle.toLowerCase().trim() ||
    !areDisplayTitlesSameProduct(currentTitle, requestedTitle)
  ) {
    return metadata;
  }

  if (
    scoreMetadataDisplayTitle(requestedTitle) <=
    scoreMetadataDisplayTitle(currentTitle)
  ) {
    return metadata;
  }

  const aliases = Array.from(
    new Set([currentTitle, ...(metadata.aliases || [])]),
  ).filter(
    (alias) =>
      alias.toLowerCase().trim() !== requestedTitle.toLowerCase().trim(),
  );

  return {
    ...metadata,
    title: requestedTitle,
    aliases: aliases.length > 0 ? aliases : undefined,
    fieldEvidence: dedupeFieldEvidence([
      ...(metadata.fieldEvidence || []),
      {
        field: "title",
        source: "RequestedDisplayTitle",
        value: requestedTitle,
        confidence: 0.62,
        priority: 180,
        rawValue: {
          previousTitle: currentTitle,
          reason: "preferred localized/requested display title",
        },
      },
    ]),
  };
}

const fetchFromDeezer = createDeezerResolver();

/**
 * Directly scrapes thecoverproject.net for a front cover image.
 * Uses browser-like headers to avoid 403 blocks.
 * Does NOT use any SERP/Google API — always available regardless of admin settings.
 */
async function fetchCoverFromCoverProject(
  name: string,
  platformName: string,
): Promise<string | null> {
  const browserHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: "https://www.thecoverproject.net/",
  };

  const queries = [
    platformName ? `${name} ${platformName}` : null,
    name,
  ].filter(Boolean) as string[];

  for (const q of queries) {
    try {
      const searchUrl = `https://www.thecoverproject.net/search_simple.php?name=${encodeURIComponent(q)}`;
      const res = await axios.get<string>(searchUrl, {
        headers: browserHeaders,
        timeout: 2500,
      });
      const html = res.data;

      // The Cover Project search results contain thumbnail links like:
      // <a href="view.php?cat_id=...&cov_id=..."><img src="...cdn...thumb.jpg" />
      // Extract the first full-size cover URL from the CDN pattern
      const cdnThumbMatch = html.match(
        /(https?:\/\/[^"']*coverproject[^"']*(?:_thumb|_cover)[^"']*\.(?:jpg|png|webp))/i,
      );
      if (cdnThumbMatch) {
        // Prefer full cover over thumbnail when available
        const fullCover = cdnThumbMatch[1].replace(/_thumb\./, "_cover.");
        return fullCover;
      }

      // Fallback: extract any image from the CDN domain
      const cdnMatch = html.match(
        /(https?:\/\/[^"']*coverproject\.sfo2\.cdn[^"']*\.(?:jpg|png|webp))/i,
      );
      if (cdnMatch) return cdnMatch[1];
    } catch (e: any) {
      if (e?.response?.status !== 403) {
        console.warn(
          `[CoverProject] Direct search failed for "${q}": ${e?.message || e}`,
        );
      }
    }
  }

  return null;
}

const fetchFromScreenScraper = createScreenScraperResolver({
  cleanSearchQuery,
  formatScore,
});

const fetchFromRawg = createRawgResolver({
  formatScore,
  fetchCoverFromCoverProject,
});

const fetchFromBGG = createBGGResolver({ formatScore });

const fetchFromOpenLibrary = createOpenLibraryResolver();

const fetchFromTMDB = createTMDBResolver({
  formatScore,
  cleanSearchQuery,
});

const fetchFromOMDb = createOMDbResolver();

function cleanSearchQuery(name: string): string {
  let cleaned = name;
  cleaned = cleaned.replace(/\b\d{12,13}\b/g, "");
  cleaned = cleaned.replace(
    /^\s*(microsoft|nintendo|sony|sega|atari|capcom|konami|namco|bandai|ubisoft|square\s*enix|disney|ea|electronic\s*arts|warner\s*bros|wb|activision|mojang|rockstar|valve|blizzard)\b\s*[-–—:|]*\s*/gi,
    "",
  );
  cleaned = cleaned.replace(
    /\s*[-–—|]\s*.*?\b(ebay|amazon|fnac|pricecharting|rakuten|leboncoin|cdiscount|carrefour|auchan|boulanger|darty|cultura|decitre|deezer|discogs|qobuz|retroplace|micromania|philibert)\b.*/gi,
    "",
  );
  cleaned = cleaned.replace(
    /\b(ps1|ps2|ps3|ps4|ps5|playstation\s*\d?|xbox\s*(one|series\s*[xs]|\d{360})?|nintendo\s*switch|wii\s*u?|switch|ds|3ds|pc|dvd|vhs|blu\s*ray|bluray)\b/gi,
    "",
  );
  cleaned = cleaned.replace(
    /\b(good\s+condition|condition|new|used|occasion|neuf|pal|ntsc|fr|fra|fre|us|usa|uk|eu|eur|jp|jpn|import|jeu\s+vid[eé]o|jeu|game|jeux(?!\s+olympiques?)|sans\s+notice|avec\s+notice|boite\s+avec\s+notice|sans\s+boite|cib|loose|notice|boite|sans|complet|complete|vf|vo|vost|vostfr|eng|ger|de|it|ita|es|spa)\b/gi,
    "",
  );
  cleaned = cleaned.replace(
    /\b(microsoft|sony|nintendo|sega|atari|capcom|konami|ubisoft|ea)\b\s*$/gi,
    "",
  );
  cleaned = cleaned.replace(/\[[^\]]*\]/g, "");
  cleaned = cleaned.replace(/\([^)]*\)/g, "");
  cleaned = cleaned.replace(/\s*[-–—:|]+\s*$/g, "");
  cleaned = cleaned.replace(/^\s*[-–—:|]+\s*/g, "");
  cleaned = cleaned.replace(/\s+/g, " ");
  return cleaned.trim();
}

function normalizeSuggestionTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export async function confrontWithDatabase(
  name: string,
  type?: string | null,
): Promise<string> {
  if (!name || !type) return name;
  const cleanedName = cleanSearchQuery(name);
  if (!cleanedName) return name;
  try {
    switch (type) {
      case "games": {
        const game = await fetchFromIGDB(cleanedName);
        if (game && game.title) return game.title;
        break;
      }
      case "movies": {
        const movie = await fetchFromTMDB(cleanedName);
        if (movie && movie.title) return movie.title;
        break;
      }
      case "books": {
        const book = await fetchFromOpenLibrary(cleanedName);
        if (book && book.title) return book.title;
        break;
      }
      case "musics": {
        const music = await fetchFromDeezer(cleanedName);
        if (music && music.title) return music.title;
        break;
      }
      case "boardgames": {
        const boardgame = await fetchFromBGG(cleanedName);
        if (boardgame && boardgame.title) return boardgame.title;
        break;
      }
    }
  } catch (e) {
    console.warn(`[ConfrontWithDatabase] Error for "${name}" (${type}):`, e);
  }
  return name;
}

async function getTMDBSuggestions(name: string): Promise<string[]> {
  try {
    const seriesIntent = parseTMDBSeriesIntent(name, cleanSearchQuery);
    const movieSearchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(name)}&api_key=${process.env.TMDB_API_KEY}&language=fr-FR`;
    const tvSearchUrl = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(seriesIntent.searchTitle)}&api_key=${process.env.TMDB_API_KEY}&language=fr-FR`;

    const [movieRes, tvRes] = await Promise.all([
      seriesIntent.isSeriesLike
        ? Promise.resolve({ data: { results: [] } })
        : axios.get(movieSearchUrl),
      axios.get(tvSearchUrl),
    ]);

    const movieSuggestions = (movieRes.data?.results || [])
      .slice(0, 5)
      .map((m: any) => m.title as string)
      .filter(Boolean);
    const tvSuggestions = (tvRes.data?.results || [])
      .slice(0, 5)
      .map((m: any) =>
        seriesIntent.seasonNumber
          ? `${m.name} - Saison ${seriesIntent.seasonNumber}`
          : (m.name as string),
      )
      .filter(Boolean);

    return Array.from(
      new Set(
        seriesIntent.isSeriesLike
          ? [...tvSuggestions, ...movieSuggestions]
          : [...movieSuggestions, ...tvSuggestions],
      ),
    ).slice(0, 5);
  } catch (e) {
    console.warn("[TMDB] Suggestions failed:", e);
    return [];
  }
}

async function getOpenLibrarySuggestions(name: string): Promise<string[]> {
  try {
    const res = await axios.get(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(name)}&limit=5`,
    );
    return (res.data?.docs || [])
      .slice(0, 5)
      .map((d: any) => d.title as string);
  } catch (e) {
    console.warn("[OpenLibrary] Suggestions failed:", e);
    return [];
  }
}

async function getDeezerSuggestions(name: string): Promise<string[]> {
  try {
    const searchUrl = `https://api.deezer.com/search/album?q=${encodeURIComponent(name)}`;
    const res = await axios.get(searchUrl);
    return (res.data?.data || []).slice(0, 5).map((album: any) => {
      const artistName = album.artist?.name || "";
      return (
        artistName ? `${artistName} - ${album.title}` : album.title
      ) as string;
    });
  } catch (e) {
    console.warn("[Deezer] Suggestions failed:", e);
    return [];
  }
}

async function getBGGSuggestions(name: string): Promise<string[]> {
  try {
    const searchUrl = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(name)}&type=boardgame`;
    const searchRes = await axios.get(searchUrl, {
      responseType: "text",
      timeout: 5000,
    });
    const searchData = convertXML(searchRes.data) as BGGResponse;
    const items = searchData.items?.children || [];
    return items
      .slice(0, 5)
      .map((item: any) => {
        return (item.item.children.find(
          (child: BGGChild) => child.name?.type === "primary",
        )?.name?.value || "") as string;
      })
      .filter(Boolean);
  } catch (e) {
    console.warn("[BGG] Suggestions failed:", e);
    return [];
  }
}

export async function getDatabaseSuggestions(
  name: string,
  type?: string | null,
  platform?: string | null,
): Promise<string[]> {
  if (!name || !type) return [];
  const cleanedName = cleanSearchQuery(name);
  if (!cleanedName) return [];
  try {
    let list: string[] = [];
    switch (type) {
      case "games": {
        const rawName = name.trim();
        const rawSuggestions = await getIGDBSuggestions(rawName, platform);
        const hasExactSuggestion = rawSuggestions.some(
          (suggestion) =>
            normalizeSuggestionTitle(suggestion) ===
            normalizeSuggestionTitle(rawName),
        );
        list = hasExactSuggestion
          ? rawSuggestions.filter(
              (suggestion) =>
                normalizeSuggestionTitle(suggestion) ===
                normalizeSuggestionTitle(rawName),
            )
          : Array.from(
              new Set([
                ...rawSuggestions,
                ...(cleanedName.toLowerCase() !== rawName.toLowerCase()
                  ? await getIGDBSuggestions(cleanedName, platform)
                  : []),
              ]),
            );
        break;
      }
      case "movies":
        list = await getTMDBSuggestions(cleanedName);
        break;
      case "books":
        list = await getOpenLibrarySuggestions(cleanedName);
        break;
      case "musics":
        list = await getDeezerSuggestions(cleanedName);
        break;
      case "boardgames":
        list = await getBGGSuggestions(cleanedName);
        break;
    }
    return list.map((item) => decodeHTMLEntities(item));
  } catch (e) {
    console.warn(`[getDatabaseSuggestions] Error for "${name}" (${type}):`, e);
  }
  return [];
}

export {
  fetchFromDeezer,
  fetchCoverFromCoverProject,
  pickSSCover,
  fetchFromScreenScraper,
  fetchFromRawg,
  fetchFromBGG,
  fetchFromOpenLibrary,
  fetchFromTMDB,
  fetchFromOMDb,
  cleanSearchQuery,
};

export type { SSMedia } from "@/services/providers/screenScraperProvider";
