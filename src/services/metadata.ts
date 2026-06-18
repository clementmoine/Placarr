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
import { parse, format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { getSetting } from "./settings";
import { applyConsensus } from "@/lib/metadataConsensus";
import {
  replaceFieldEvidence,
  type FieldEvidenceInput,
} from "@/services/evidence";
import { fetchFromIGDB, getIGDBSuggestions } from "./igdb";
import { fetchFromSteam } from "./steam";
import { fetchFromHowLongToBeat } from "./howLongToBeat";
import { fetchFromSteamGridDB } from "./steamGridDb";

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
  switch (type) {
    case "musics":
      return withProviderEvidence(
        (await fetchFromDeezer(name, barcode)) as MetadataResult | null,
        "Deezer",
      );
    case "games":
      return fetchFromAllGameSources(name, barcode, platform);
    case "boardgames":
      return withProviderEvidence(
        (await fetchFromBGG(name)) as MetadataResult | null,
        "BoardGameGeek",
      );
    case "books":
      return withProviderEvidence(
        (await fetchFromOpenLibrary(name, barcode)) as MetadataResult | null,
        "OpenLibrary",
      );
    case "movies":
      return withProviderEvidence(
        (await fetchFromTMDB(name)) as MetadataResult | null,
        "TMDB",
      );
    default:
      return null;
  }
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
  const [
    igdbResult,
    ssResult,
    hltbResult,
    steamResult,
    rawgResult,
    steamGridResult,
  ] = await Promise.allSettled([
    fetchFromIGDB(name, platform),
    fetchFromScreenScraper(name, barcode, platform),
    fetchFromHowLongToBeat(name, platform),
    includePcSources ? fetchFromSteam(name) : Promise.resolve(null),
    fetchFromRawg(name),
    fetchFromSteamGridDB(name),
  ]);

  let igdb = igdbResult.status === "fulfilled" ? igdbResult.value : null;
  let ss = ssResult.status === "fulfilled" ? ssResult.value : null;
  let hltb = hltbResult.status === "fulfilled" ? hltbResult.value : null;
  const steam = steamResult.status === "fulfilled" ? steamResult.value : null;
  let rawg = rawgResult.status === "fulfilled" ? rawgResult.value : null;
  let steamGrid =
    steamGridResult.status === "fulfilled" ? steamGridResult.value : null;

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
  const mergedWithEvidence = {
    ...merged,
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

async function fetchFromDeezer(name: string, barcode?: string | null) {
  if (!name && barcode) {
    try {
      const res = await axios.get(
        `https://api.deezer.com/album/upc:${barcode}`,
      );
      const album = res.data;
      if (album && album.title && !album.error) {
        const artistName = album.artist?.name || "";
        const title = artistName
          ? `${artistName} - ${album.title}`
          : album.title;
        const albumDetailsRes = await axios.get(
          `https://api.deezer.com/album/${album.id}`,
        );
        const bestMatch = albumDetailsRes.data;
        if (bestMatch && bestMatch.title) {
          return {
            title: title,
            authors:
              bestMatch.contributors?.map(
                (c: { name: string; picture_xl: string }) => ({
                  name: c.name,
                  imageUrl: c.picture_xl,
                }),
              ) || [],
            publishers: [
              {
                name: bestMatch.label,
              },
            ],
            duration: bestMatch.duration,
            tracksCount: bestMatch.nb_tracks,
            releaseDate: bestMatch.release_date,
            imageUrl: bestMatch.cover_big,
            attachments: [
              ...(bestMatch.cover_big
                ? [
                    {
                      type: "cover",
                      url: bestMatch.cover_big,
                      source: "deezer",
                    },
                  ]
                : []),
              ...(bestMatch.tracks?.data?.map(
                (track: {
                  title: string;
                  duration: number;
                  preview: string;
                }) => ({
                  type: "audio",
                  title: track.title,
                  duration: track.duration,
                  url: track.preview,
                  source: "deezer",
                }),
              ) || []),
            ],
          };
        }
      }
    } catch (error) {
      console.error(`[Deezer] Error looking up barcode "${barcode}":`, error);
    }
    return null;
  }

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
    attachments: [
      ...(bestMatch.cover_big
        ? [
            {
              type: "cover",
              url: bestMatch.cover_big,
              source: "deezer",
            },
          ]
        : []),
      ...bestMatch.tracks.data.map(
        (track: { title: string; duration: number; preview: string }) => ({
          type: "audio",
          title: track.title,
          duration: track.duration,
          url: track.preview,
          source: "deezer",
        }),
      ),
    ],
  };
}

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

/**
 * Maps a RAWG platform name to a ScreenScraper system ID.
 * Only the most common modern platforms are listed; omitting = fall through to search.
 */
const RAWG_PLATFORM_TO_SS_SYSTEM: Record<string, number> = {
  "PlayStation 5": 284,
  "PlayStation 4": 60,
  "PlayStation 3": 59,
  "PlayStation 2": 58,
  PlayStation: 57,
  "Xbox One": 34,
  "Xbox Series S/X": 34,
  "Xbox 360": 33,
  Xbox: 32,
  "Nintendo Switch": 225,
  "Nintendo 3DS": 17,
  "Nintendo DS": 15,
  "Wii U": 18,
  Wii: 16,
  PC: 138,
  "PC (Windows)": 138,
};

const SS_SYSTEM_TO_PLATFORM_KEY: Record<number, string> = {
  15: "ds",
  16: "wii",
  17: "3ds",
  18: "wiiu",
  32: "xbox",
  33: "xbox360",
  34: "xboxone",
  57: "ps1",
  58: "ps2",
  59: "ps3",
  60: "ps4",
  138: "pc",
  225: "switch",
  284: "ps5",
};

function getPlatformKeyFromSSSystemId(systemId?: number): string | undefined {
  if (!systemId) return undefined;
  return SS_SYSTEM_TO_PLATFORM_KEY[systemId];
}

function getPlatformKeyFromSSMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const systemMatch = url.match(/[?&]systemeid=(\d+)/);
  const systemId = systemMatch ? Number(systemMatch[1]) : undefined;
  return getPlatformKeyFromSSSystemId(systemId);
}

export interface SSMedia {
  type: string;
  url: string;
  region?: string;
  format?: string;
}

export interface SSGame {
  id?: number;
  noms?: { region: string; text: string }[];
  synopsis?: { langue: string; text: string }[];
  dates?: { region: string; text: string }[];
  editeur?: { text: string };
  developpeur?: { text: string };
  note?: { text: string };
  classifications?: { type?: string; text?: string }[];
  medias?: SSMedia[];
}

function buildScreenScraperFacts(gameData: SSGame): MetadataFact[] {
  const facts: MetadataFact[] = [];

  const classification = gameData.classifications?.find((item) => item.text);
  const ageMatch = classification?.text?.match(/\d+/);
  if (ageMatch) {
    facts.push({
      kind: "age-rating",
      label: "PEGI",
      value: ageMatch[0],
      source: "screenscraper",
      confidence: 0.94,
      priority: 125,
    });
  }

  const note = Number(gameData.note?.text?.replace(",", "."));
  const rating = formatScore(note, 20);
  if (rating) {
    facts.push({
      kind: "rating",
      label: "ScreenScraper",
      value: rating,
      source: "screenscraper",
      confidence: 0.74,
      priority: 76,
    });
  }

  return facts;
}

/**
 * Picks the best cover image URL from ScreenScraper medias array.
 * Prefers a true front cover first, then the best region inside that type.
 * This keeps box-2D(eu) above decorative mix images such as mixrbv2(fr).
 */
export function pickSSCover(medias: SSMedia[]): string | null {
  // Uniquement de vraies boîtes scannées (pas de rendus "mix" reconstitués).
  const preferredTypes = ["box-2D", "box-3D"];
  const regionOrder = ["fr", "eu", "wor", "us", "jp"];

  // Type quality matters most for the default poster: flat box art beats
  // a localized composite/mix image even when the mix is French.
  for (const type of preferredTypes) {
    for (const region of regionOrder) {
      const found = medias.find((m) => m.type === type && m.region === region);
      if (found) return found.url;
    }
  }

  // Fall back to any preferred cover type if ScreenScraper omitted region data.
  for (const type of preferredTypes) {
    const found = medias.find((m) => m.type === type);
    if (found) return found.url;
  }

  // Pas de vraie boîte → on ne renvoie pas une image quelconque (mix,
  // screenshot…) : on laisse une autre source (SteamGridDB, etc.) fournir la cover.
  return null;
}

/**
 * Picks the best title text from ScreenScraper noms array.
 * Prefers localized French titles, then broader European/world titles, while
 * keeping the cleanest display variant when ScreenScraper exposes aliases.
 */
function pickSSTitle(noms?: SSGame["noms"]): string | undefined {
  if (!noms || noms.length === 0) return undefined;
  const regionOrder = ["fr", "eu", "wor", "uk", "us", "jp"];
  const regionRank = (region?: string) => {
    const index = regionOrder.indexOf((region || "").toLowerCase());
    return index === -1 ? regionOrder.length : index;
  };

  return noms
    .slice()
    .sort((a, b) => regionRank(a.region) - regionRank(b.region))[0]?.text;
}

/**
 * Picks the best synopsis from ScreenScraper synopsis array.
 * Prefers French copy for a French-first interface.
 */
function pickSSSynopsis(synopsis?: SSGame["synopsis"]): string | undefined {
  if (!synopsis || synopsis.length === 0) return undefined;
  const langOrder = ["fr", "en"];
  for (const lang of langOrder) {
    const found = synopsis.find((s) => s.langue === lang);
    if (found) return found.text;
  }
  return synopsis[0].text;
}

function detectSystemIdFromName(name: string): number | undefined {
  const lower = name.toLowerCase().replace(/[._-]+/g, " ");
  const has = (pattern: RegExp) => pattern.test(lower);

  if (has(/\bps5\b|\bplaystation\s+5\b/)) return 284;
  if (has(/\bps4\b|\bplaystation\s+4\b/)) return 60;
  if (has(/\bps3\b|\bplaystation\s+3\b/)) return 59;
  if (has(/\bps2\b|\bplaystation\s+2\b/)) return 58;
  if (has(/\bps1\b/) || has(/\bplaystation\s+1\b/) || has(/\bplaystation\b/))
    return 57;
  if (
    has(/\bxbox\s+series\b/) ||
    has(/\bxbox\s+sx\b/) ||
    has(/\bxbox\s+s\/x\b/)
  )
    return 34;
  if (has(/\bxbox\s+one\b|\bxboxone\b/)) return 34;
  if (has(/\bxbox\s+360\b|\bxbox360\b/)) return 33;
  if (has(/\bxbox\b/)) return 32;
  if (has(/\bswitch\b|\bnintendo\s+switch\b/)) return 225;
  if (has(/\b3ds\b|\bnintendo\s+3ds\b/)) return 17;
  if (has(/\bds\b|\bnds\b|\bnintendo\s+ds\b/)) return 15;
  if (has(/\bwii\s+u\b|\bwiiu\b/)) return 18;
  if (has(/\bwii\b/)) return 16;
  if (has(/\bpc\b|\bwindows\b/)) return 138;
  if (has(/\bgamecube\b/) || has(/\bgame\s+cube\b/) || has(/\bgcn\b/))
    return 13;
  if (has(/\bdreamcast\b/)) return 23;
  if (has(/\bn64\b|\bnintendo\s+64\b/)) return 14;
  if (has(/\bsuper\s+nintendo\b/) || has(/\bsnes\b/) || has(/\bsuper\s+nes\b/))
    return 4;
  if (has(/\bnes\b|\bnintendo\s+entertainment\s+system\b/)) return 3;
  if (has(/\bgame\s+boy\s+advance\b|\bgba\b/)) return 12;
  if (has(/\bgame\s+boy\s+color\b|\bgbc\b/)) return 10;
  if (has(/\bgame\s+boy\b/) || has(/\bgameboy\b/) || has(/\bgb\b/)) return 9;
  if (has(/\bmega\s+drive\b/) || has(/\bmegadrive\b/) || has(/\bgenesis\b/))
    return 21;
  if (has(/\bmaster\s+system\b|\bmastersystem\b/)) return 2;
  if (has(/\bgame\s+gear\b|\bgamegear\b/)) return 22;
  if (has(/\bneo\s+geo\b|\bneogeo\b/)) return 24;
  if (has(/\batari\s+2600\b/) || has(/\batari2600\b/) || has(/\batari\b/))
    return 26;
  if (has(/\bpsp\b|\bplaystation\s+portable\b/)) return 61;
  if (has(/\bvita\b/) || has(/\bplaystation\s+vita\b/) || has(/\bps\s+vita\b/))
    return 62;
  return undefined;
}

function detectCachedCandidateSystemId(name: string): number | undefined {
  const systemId = detectSystemIdFromName(name);
  if (systemId) return systemId;

  const normalized = name.toLowerCase().replace(/[._-]+/g, " ");
  if (/\b64\b/.test(normalized)) return 14;

  return undefined;
}

function hasCachedCandidateSystemConflict(
  name: string,
  requestedSystemId?: number,
): boolean {
  if (!requestedSystemId) return false;
  const candidateSystemId = detectCachedCandidateSystemId(name);
  return !!candidateSystemId && candidateSystemId !== requestedSystemId;
}

function normalizeScreenScraperSearchQuery(value: string): string {
  return value.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

function uniqueScreenScraperSearchQueries(values: string[]): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];

  for (const value of values) {
    const normalized = normalizeScreenScraperSearchQuery(value);
    if (normalized.length < 2) continue;

    const key = normalized
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    queries.push(normalized);
  }

  return queries;
}

const BROAD_SCREENSCRAPER_FALLBACK_WORDS = new Set([
  "star",
  "super",
  "the",
  "les",
  "des",
  "jeu",
  "jeux",
  "wii",
  "nintendo",
]);

function screenScraperSignificantTokens(value: string): Set<string> {
  const tokens = cleanSearchQuery(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length > 2 &&
        !BROAD_SCREENSCRAPER_FALLBACK_WORDS.has(token) &&
        !["pour", "avec", "sans", "sur", "force"].includes(token),
    );

  return new Set(tokens);
}

function isPlausibleScreenScraperFallbackResult(
  originalName: string,
  resultName: string,
): boolean {
  const originalTokens = screenScraperSignificantTokens(originalName);
  const resultTokens = screenScraperSignificantTokens(resultName);
  if (originalTokens.size <= 1) return true;

  const overlap = [...originalTokens].filter((token) =>
    resultTokens.has(token),
  );
  return overlap.length >= Math.min(2, originalTokens.size);
}

function buildScreenScraperSearchQueries(name: string): string[] {
  const cleanedName = cleanSearchQuery(name);
  const bases = uniqueScreenScraperSearchQueries([cleanedName, name]);
  const variants: string[] = [];

  for (const base of bases) {
    variants.push(
      base,
      base.replace(/\s*:\s*/g, " : "),
      base.replace(/\s*:\s*/g, ": "),
      base.replace(/\s*[-–—]\s*/g, " : "),
      base.replace(/\s*[-–—]\s*/g, ": "),
      base.replace(/\s*:\s*/g, " - "),
      base.replace(/\s*[:\-–—]\s*/g, " "),
      base.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    );
  }

  return uniqueScreenScraperSearchQueries(variants).slice(0, 8);
}

async function searchScreenScraperGames(
  baseParams: Record<string, string>,
  query: string,
  systemeid?: number,
): Promise<any[]> {
  const searchRes = await axios.get<{
    response: { jeux: any };
  }>("https://api.screenscraper.fr/api2/jeuRecherche.php", {
    params: {
      ...baseParams,
      recherche: query,
      ...(systemeid ? { systemeid: String(systemeid) } : {}),
    },
    timeout: 8000,
  });

  let results = searchRes.data?.response?.jeux;
  if (results && !Array.isArray(results)) {
    results = [results];
  }

  return (results || []).filter((r: any) => r && r.id);
}

/**
 * Primary game metadata source: ScreenScraper.fr
 * - Looks up by barcode if provided (most accurate)
 * - Otherwise searches by name, then fetches full game info
 * - Falls back to RAWG if ScreenScraper is unconfigured or returns nothing
 */
async function fetchFromScreenScraper(
  name: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataResult | null> {
  const devId = process.env.SCREENSCRAPER_DEV_ID;
  const devPass = process.env.SCREENSCRAPER_DEV_PASSWORD;

  // Return null if no ScreenScraper credentials configured
  if (!devId || !devPass) {
    console.info("[ScreenScraper] Not configured");
    return null;
  }

  const ssUser = process.env.SCREENSCRAPER_USER || "";
  const ssPass = process.env.SCREENSCRAPER_PASSWORD || "";

  const baseParams: Record<string, string> = {
    devid: devId,
    devpassword: devPass,
    softname: "Placarr",
    output: "json",
    ...(ssUser && ssPass ? { ssid: ssUser, sspassword: ssPass } : {}),
  };

  try {
    let gameData: SSGame | null = null;
    let systemeid = platform ? detectSystemIdFromName(platform) : undefined;
    let resolvedSystemId: number | undefined;
    if (!systemeid && name) {
      systemeid = detectSystemIdFromName(name);
    }

    if (barcode && systemeid !== undefined && systemeid > 0) {
      const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
      if (cleanedBarcode.length > 0) {
        try {
          const res = await axios.get<{ response: { jeu: SSGame } }>(
            "https://api.screenscraper.fr/api2/jeuInfos.php",
            {
              params: {
                ...baseParams,
                crc: "",
                md5: "",
                sha1: "",
                systemeid: String(systemeid),
                romtype: "rom",
                romnom: cleanedBarcode,
                romtaille: "",
              },
              timeout: 8000,
            },
          );
          const jeu = res.data?.response?.jeu;
          if (jeu && jeu.id) {
            gameData = jeu;
            resolvedSystemId = systemeid;
            console.info(
              `[ScreenScraper] Successfully found game by barcode "${cleanedBarcode}": "${pickSSTitle(jeu.noms) || name || ""}"`,
            );
          }
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            console.info(
              `[ScreenScraper] No direct barcode match for "${cleanedBarcode}", trying name fallback`,
            );
          } else {
            console.error(
              `[ScreenScraper] Error looking up barcode "${cleanedBarcode}":`,
              error,
            );
          }
        }
      }
    }

    if (!gameData) {
      if (!name) return null;
      const cleanedName = cleanSearchQuery(name);
      let searchNameUsed = cleanedName;

      // ── Strategy: Name search → jeuInfos ──────────────────────────────────
      let validResults: any[] = [];
      for (const query of buildScreenScraperSearchQueries(name)) {
        try {
          validResults = await searchScreenScraperGames(
            baseParams,
            query,
            systemeid,
          );
          if (validResults.length > 0) {
            searchNameUsed = query;
            break;
          }
        } catch (err: any) {
          console.error(
            `[ScreenScraper] Search error for "${query}":`,
            err.message,
          );
        }
      }

      if (!validResults || validResults.length === 0) {
        if (barcode) {
          const cleanedBarcode = barcode.replace(/[^\d]/g, "").trim();
          if (cleanedBarcode) {
            try {
              const cached = await prisma.barcodeCache.findUnique({
                where: { barcode: cleanedBarcode },
                include: { rawNames: true },
              });
              if (cached && cached.rawNames.length > 0) {
                const candidates = cached.rawNames
                  .map((rn) => cleanSearchQuery(rn.value))
                  .filter(
                    (value) =>
                      value &&
                      !hasCachedCandidateSystemConflict(value, systemeid),
                  )
                  .filter((v, i, self) => v && self.indexOf(v) === i);

                for (const cand of candidates) {
                  if (cand.toLowerCase() === cleanedName.toLowerCase())
                    continue;
                  console.log(
                    `[ScreenScraper] Trying cached barcode suggestion search: "${cand}"`,
                  );
                  for (const query of buildScreenScraperSearchQueries(cand)) {
                    try {
                      const newValid = await searchScreenScraperGames(
                        baseParams,
                        query,
                        systemeid,
                      );
                      if (newValid.length > 0) {
                        validResults = newValid;
                        searchNameUsed = query;
                        console.log(
                          `[ScreenScraper] Found match via cached suggestion "${query}"`,
                        );
                        break;
                      }
                    } catch (err: any) {
                      console.error(
                        `[ScreenScraper] Cached suggestion search error for "${query}":`,
                        err.message,
                      );
                    }
                  }
                  if (validResults.length > 0) break;
                }
              }
            } catch (err) {
              console.error(
                "[ScreenScraper] Error fetching barcode cache suggestions:",
                err,
              );
            }
          }
        }
      }

      if (!validResults || validResults.length === 0) {
        const firstWord = cleanedName.split(/\s+/)[0];
        if (
          firstWord &&
          firstWord.length >= 3 &&
          !BROAD_SCREENSCRAPER_FALLBACK_WORDS.has(firstWord.toLowerCase())
        ) {
          console.log(
            `[ScreenScraper] Search for "${cleanedName}" returned no results. Trying first word fallback search: "${firstWord}"`,
          );
          try {
            const fallbackResults = await searchScreenScraperGames(
              baseParams,
              firstWord,
              systemeid,
            );
            validResults = fallbackResults.filter((result: any) =>
              isPlausibleScreenScraperFallbackResult(
                cleanedName,
                pickSSTitle(result.noms) || "",
              ),
            );
            if (validResults.length > 0) {
              searchNameUsed = firstWord;
            }
          } catch (err: any) {
            console.error(
              `[ScreenScraper] Fallback search error:`,
              err.message,
            );
          }
        } else if (firstWord) {
          console.info(
            `[ScreenScraper] Skipping broad first word fallback search: "${firstWord}"`,
          );
        }
      }

      if (!validResults || validResults.length === 0) {
        console.info(`[ScreenScraper] No results for "${name}"`);
        return null;
      }

      const platformCompatibleResults = systemeid
        ? validResults.filter((r: any) => {
            const title = pickSSTitle(r.noms) || "";
            return !hasCachedCandidateSystemConflict(title, systemeid);
          })
        : validResults;
      const rankedResults =
        platformCompatibleResults.length > 0
          ? platformCompatibleResults
          : validResults;

      // Pick best match by Levenshtein distance on the title
      let bestId = rankedResults[0].id;
      let minDist = Infinity;
      for (const r of rankedResults) {
        const rTitle = pickSSTitle(r.noms)?.toLowerCase() || "";
        const dist = levenshtein.get(searchNameUsed.toLowerCase(), rTitle);
        if (dist < minDist) {
          minDist = dist;
          bestId = r.id;
        }
      }

      // Fetch full game info by ID
      const infoRes = await axios.get<{ response: { jeu: SSGame } }>(
        "https://api.screenscraper.fr/api2/jeuInfos.php",
        {
          params: {
            ...baseParams,
            crc: "",
            md5: "",
            sha1: "",
            systemeid: "0",
            romtype: "rom",
            romnom: "",
            romtaille: "",
            gameid: String(bestId),
          },
          timeout: 8000,
        },
      );
      const jeu = infoRes.data?.response?.jeu;
      if (jeu && jeu.id) {
        gameData = jeu;
        resolvedSystemId = systemeid;
      }
    }

    if (!gameData) {
      console.info(`[ScreenScraper] Could not fetch game data for "${name}"`);
      return null;
    }

    // ── Parse ────────────────────────────────────────────────────────────────
    const title = pickSSTitle(gameData.noms) || name;
    const description = pickSSSynopsis(gameData.synopsis);
    const imageUrl = gameData.medias ? pickSSCover(gameData.medias) : null;
    const releaseDate = gameData.dates?.[0]?.text ?? undefined;
    const publisherName = gameData.editeur?.text ?? gameData.developpeur?.text;
    const facts = buildScreenScraperFacts(gameData);

    const attachments: MetadataAttachment[] = [];

    if (gameData.medias) {
      gameData.medias.forEach((m) => {
        let type: AttachmentType | null = null;
        let role: string | null = null;

        if (m.type === "box-2D") {
          type = "cover";
          role = m.region || "wor";
        } else if (m.type === "box-3D") {
          type = "cover";
          role = m.region ? `${m.region}-3d` : "wor-3d";
          // mixrbv1 / mixrbv2 (jaquettes "mix" reconstituées) volontairement
          // ignorés : on ne veut que de vraies boîtes en cover.
        } else if (m.type === "box-2D-back" || m.type === "box-back") {
          type = "image";
          role = m.region ? `${m.region}-back` : "back";
        } else if (m.type === "support-2D" || m.type === "support-texture") {
          type = "image";
          role = m.region ? `${m.region}-support` : "support";
        } else if (m.type === "ss") {
          type = "screenshot";
          role = m.region || "wor";
        } else if (m.type === "sstitle") {
          type = "screenshot";
          role = "title";
        } else if (m.type === "wheel") {
          type = "logo";
        }

        if (type) {
          attachments.push({
            type,
            role: role || undefined,
            url: m.url,
            source: "screenscraper",
          });
        }
      });
    }

    const aliases = gameData.noms
      ? Array.from(new Set(gameData.noms.map((n) => n.text))).filter(
          (n) => n.toLowerCase().trim() !== title.toLowerCase().trim(),
        )
      : undefined;
    const regionalTitles = gameData.noms
      ? gameData.noms
          .filter((n) => n.text)
          .map((n) => ({ region: n.region, text: n.text }))
      : undefined;

    return {
      title,
      platformKey:
        getPlatformKeyFromSSSystemId(resolvedSystemId) ||
        getPlatformKeyFromSSMediaUrl(imageUrl),
      description,
      imageUrl: imageUrl ?? undefined,
      releaseDate,
      publishers: publisherName ? [{ name: publisherName }] : undefined,
      attachments,
      aliases,
      regionalTitles,
      facts: facts.length > 0 ? facts : undefined,
    };
  } catch (err) {
    console.error(
      `[ScreenScraper] Unexpected error for "${name || barcode}": ${err}`,
    );
    return null;
  }
}

async function fetchFromRawg(name: string): Promise<MetadataResult | null> {
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

  const platformName = bestMatch.platforms?.[0]?.platform?.name || "";
  let imageUrl = bestMatch.background_image;

  // 1. Try The Cover Project directly (free, no SERP API needed)
  let coverUrl = await fetchCoverFromCoverProject(bestMatch.name, platformName);
  let coverSource = "rawg";

  if (coverUrl) {
    imageUrl = coverUrl;
    coverSource = "coverproject";
  }

  const facts: MetadataFact[] = [];
  if (typeof bestMatch.metacritic === "number" && bestMatch.metacritic > 0) {
    facts.push({
      kind: "rating",
      label: "Metacritic",
      value: `${Math.round(bestMatch.metacritic)}/100`,
      source: "RAWG",
      confidence: 0.78,
      priority: 82,
    });
  }
  if (typeof bestMatch.rating === "number" && bestMatch.rating > 0) {
    const rating = formatScore(bestMatch.rating, 5);
    if (rating) {
      facts.push({
        kind: "rating",
        label: "RAWG",
        value: rating,
        source: "RAWG",
        confidence: 0.7,
        priority: 72,
      });
    }
  }

  return {
    title: bestMatch.name,
    releaseDate: bestMatch.released,
    imageUrl,
    attachments: [
      ...(imageUrl
        ? [
            {
              type: "cover",
              url: imageUrl,
              source: coverSource,
            },
          ]
        : []),
      ...(bestMatch.short_screenshots?.map((s: { image: string }) => ({
        type: "screenshot",
        url: s.image,
        source: "rawg",
      })) || []),
    ],
    facts: facts.length > 0 ? facts : undefined,
  };
}

interface BGGChild {
  name?: { type: string; value: string };
  description?: { content: string };
  yearpublished?: { value: string };
  minplayers?: { value: string };
  maxplayers?: { value: string };
  playingtime?: { value: string };
  minplaytime?: { value: string };
  maxplaytime?: { value: string };
  minage?: { value: string };
  image?: { content: string };
  link?: { type: string; id: string; value: string };
  statistics?: { children?: any[] };
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

function getBGGRatingValue(
  game: { children?: BGGChild[] },
  key: string,
): string | undefined {
  const statistics = game.children?.find(
    (child) => child.statistics,
  )?.statistics;
  const ratings = statistics?.children?.find(
    (child: any) => child.ratings,
  )?.ratings;
  const rating = ratings?.children?.find((child: any) => child[key])?.[key];
  return rating?.value;
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

    const minPlayers = game.children.find((child: BGGChild) => child.minplayers)
      ?.minplayers?.value;
    const maxPlayers = game.children.find((child: BGGChild) => child.maxplayers)
      ?.maxplayers?.value;
    const playingTime = game.children.find(
      (child: BGGChild) => child.playingtime,
    )?.playingtime?.value;
    const minPlayTime = game.children.find(
      (child: BGGChild) => child.minplaytime,
    )?.minplaytime?.value;
    const maxPlayTime = game.children.find(
      (child: BGGChild) => child.maxplaytime,
    )?.maxplaytime?.value;
    const minAge = game.children.find((child: BGGChild) => child.minage)?.minage
      ?.value;
    const averageRating = getBGGRatingValue(game, "average");

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

    const alternateNames = game.children
      .filter((child: BGGChild) => child.name?.type === "alternate")
      .map((child: BGGChild) => child.name?.value)
      .filter(Boolean) as string[];
    const aliases = alternateNames.filter(
      (n) => n.toLowerCase().trim() !== primaryName?.toLowerCase().trim(),
    );

    const facts: MetadataFact[] = [];
    if (minPlayers && maxPlayers) {
      facts.push({
        kind: "players",
        label: "Joueurs",
        value:
          minPlayers === maxPlayers
            ? minPlayers
            : `${minPlayers}-${maxPlayers}`,
        source: "bgg",
        confidence: 0.82,
        priority: 90,
      });
    }
    const durationValue =
      minPlayTime && maxPlayTime && minPlayTime !== maxPlayTime
        ? `${minPlayTime}-${maxPlayTime} min`
        : playingTime
          ? `${playingTime} min`
          : null;
    if (durationValue) {
      facts.push({
        kind: "playtime",
        label: "Durée d'une partie",
        value: durationValue,
        source: "bgg",
        confidence: 0.82,
        priority: 88,
      });
    }
    if (minAge) {
      facts.push({
        kind: "age-rating",
        label: "Âge recommandé",
        value: `${minAge}+`,
        source: "bgg",
        confidence: 0.78,
        priority: 75,
      });
    }
    if (averageRating) {
      const value = formatScore(Number(averageRating), 10);
      if (value) {
        facts.push({
          kind: "rating",
          label: "BoardGameGeek",
          value,
          source: "BGG",
          confidence: 0.82,
          priority: 84,
        });
      }
    }

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
              type: "cover",
              url: image,
              source: "bgg",
            },
          ]
        : [],
      aliases,
      facts,
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
    const yearMatch = name ? name.match(/\((\d{4})\)/) : null;
    const requestedYear = yearMatch ? parseInt(yearMatch[1]) : null;
    const cleanName = name
      ? yearMatch
        ? name.replace(/\(\d{4}\)/, "").trim()
        : name
      : "";

    // First try ISBN search if barcode is provided
    if (barcode) {
      const isbnData = await fetchWithRetry<
        OpenLibraryWork & { works?: { key: string }[] }
      >(`https://openlibrary.org/isbn/${barcode}.json`);

      if (isbnData && isbnData.works?.[0]?.key) {
        if (!name) {
          workId = isbnData.works[0].key;
          workData = isbnData;
        } else {
          const isbnTitle = (isbnData.title || "").toLowerCase();
          const queryLower = cleanName.toLowerCase();
          const dist = levenshtein.get(isbnTitle, queryLower);
          const maxL = Math.max(isbnTitle.length, queryLower.length);
          const similarity = 1 - dist / maxL;

          if (
            isbnTitle.includes(queryLower) ||
            queryLower.includes(isbnTitle) ||
            similarity > 0.4
          ) {
            workId = isbnData.works[0].key;
            workData = isbnData;
          } else {
            console.warn(
              `[OpenLibrary] Barcode "${barcode}" resolved to title "${isbnData.title}", which does not match query name "${name}". Ignoring ISBN match.`,
            );
          }
        }
      }
    }

    // If no results from ISBN or no barcode provided, try title search
    if (!workId) {
      if (!name) return null;
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
          if ((bestWork as any).alternate_names) {
            (workData as any).alternate_names = (
              bestWork as any
            ).alternate_names;
          }
        } else {
          // Fallback to the original work if no editions found
          workData = await fetchWithRetry<OpenLibraryWork>(
            `https://openlibrary.org${workId}.json`,
          );
          if ((bestWork as any).alternate_names) {
            (workData as any).alternate_names = (
              bestWork as any
            ).alternate_names;
          }
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

    const alternateNames = (workData as any).alternate_names || [];
    const aliases = alternateNames.filter(
      (n: string) =>
        n.toLowerCase().trim() !== workData.title.toLowerCase().trim(),
    );

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
      attachments: [
        ...(workData.covers?.[0]
          ? [
              {
                type: "cover",
                url: `https://covers.openlibrary.org/b/id/${workData.covers[0]}-L.jpg`,
                source: "openlibrary",
              },
            ]
          : []),
        ...(workData.covers?.slice(1).map((coverId: number) => ({
          type: "cover",
          url: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`,
          source: "openlibrary",
        })) || []),
      ],
      aliases,
    };
  } catch (error) {
    console.error("Error fetching from Open Library:", error);
    return null;
  }
}

type TMDBSeriesIntent = {
  isSeriesLike: boolean;
  searchTitle: string;
  seasonNumber?: number;
};

type TMDBSearchResult = {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
};

function parseTMDBSeriesIntent(name: string): TMDBSeriesIntent {
  const seasonMatch =
    name.match(/\b(?:saison|season)\s*(\d{1,2})\b/i) ||
    name.match(/\bs(?:eason)?\s*(\d{1,2})\b/i);
  const isSeriesLike =
    /\b(saison|season|series|s[eé]rie|episode|[ée]pisode|vol(?:ume)?\.?)\b/i.test(
      name,
    ) || Boolean(seasonMatch);

  let searchTitle = name
    .replace(/\b(?:saison|season)\s*\d{1,2}\b/gi, "")
    .replace(/\bs(?:eason)?\s*\d{1,2}\b/gi, "")
    .replace(/\b(?:episode|[ée]pisode)\s*\d{1,3}\b/gi, "")
    .replace(/\bvol(?:ume)?\.?\s*\d{1,3}\b/gi, "")
    .replace(/\b(dvd|blu[\s-]?ray|bluray|coffret|box)\b/gi, "")
    .replace(/\s*[-–—:|]+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!searchTitle) searchTitle = cleanSearchQuery(name) || name;

  return {
    isSeriesLike,
    searchTitle,
    seasonNumber: seasonMatch ? Number(seasonMatch[1]) : undefined,
  };
}

function pickBestTMDBMatch<T extends { title?: string; name?: string }>(
  query: string,
  results: T[],
): T | null {
  if (results.length === 0) return null;

  const normalizedQuery = query.toLowerCase();
  let bestMatch = results[0];
  let minDistance = Number.POSITIVE_INFINITY;

  for (const result of results) {
    const titles = [result.title, result.name].filter(Boolean) as string[];
    const distance = Math.min(
      ...titles.map((title) =>
        levenshtein.get(normalizedQuery, title.toLowerCase()),
      ),
    );
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = result;
    }
  }

  return bestMatch;
}

async function fetchFromTMDB(name: string) {
  const seriesIntent = parseTMDBSeriesIntent(name);

  if (seriesIntent.isSeriesLike) {
    const tvResult = await fetchFromTMDBSeries(name);
    if (tvResult) return tvResult;
    return fetchFromTMDBMovie(name);
  }

  const movieResult = await fetchFromTMDBMovie(name);
  if (movieResult) return movieResult;
  return fetchFromTMDBSeries(name);
}

async function fetchFromTMDBMovie(name: string) {
  const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(name)}&api_key=${process.env.TMDB_API_KEY}&language=fr-FR`;
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
    `https://api.themoviedb.org/3/movie/${bestMatch.id}?api_key=${process.env.TMDB_API_KEY}&language=fr-FR`,
  );
  const details = detailsRes.data;

  const creditsRes = await axios.get(
    `https://api.themoviedb.org/3/movie/${bestMatch.id}/credits?api_key=${process.env.TMDB_API_KEY}&language=fr-FR`,
  );
  const credits = creditsRes.data;

  // Fetch TMDB images (alternative posters, backdrops, logos)
  let imagesData: {
    posters?: { file_path: string }[];
    backdrops?: { file_path: string }[];
    logos?: { file_path: string }[];
  } = {};
  try {
    const imagesRes = await axios.get(
      `https://api.themoviedb.org/3/movie/${bestMatch.id}/images?api_key=${process.env.TMDB_API_KEY}`,
    );
    imagesData = imagesRes.data;
  } catch (err) {
    console.error(
      `[TMDB] Failed to fetch images for movie ID ${bestMatch.id}:`,
      err,
    );
  }

  const tmdbPosters = (imagesData.posters || [])
    .slice(0, 30)
    .map((img: { file_path: string }) => ({
      type: "cover" as const,
      url: `https://image.tmdb.org/t/p/w780${img.file_path}`,
      source: "tmdb",
    }));

  const tmdbBackdrops = (imagesData.backdrops || [])
    .slice(0, 30)
    .map((img: { file_path: string }) => ({
      type: "background" as const,
      url: `https://image.tmdb.org/t/p/w1280${img.file_path}`,
      source: "tmdb",
    }));

  const tmdbLogos = (imagesData.logos || [])
    .slice(0, 10)
    .map((img: { file_path: string }) => ({
      type: "logo" as const,
      url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
      source: "tmdb",
    }));

  const coverUrl = bestMatch.poster_path
    ? `https://image.tmdb.org/t/p/w780${bestMatch.poster_path}`
    : null;

  let aliases: string[] = [];
  try {
    const titlesRes = await axios.get(
      `https://api.themoviedb.org/3/movie/${bestMatch.id}/alternative_titles?api_key=${process.env.TMDB_API_KEY}`,
    );
    aliases = (titlesRes.data?.titles || [])
      .map((t: any) => t.title as string)
      .filter(
        (t: string) =>
          t.toLowerCase().trim() !== bestMatch.title.toLowerCase().trim(),
      );
  } catch (err) {
    console.error(
      `[TMDB] Failed to fetch alternative titles for movie ID ${bestMatch.id}:`,
      err,
    );
  }

  let certification: string | null = null;
  try {
    const releaseDatesRes = await axios.get(
      `https://api.themoviedb.org/3/movie/${bestMatch.id}/release_dates?api_key=${process.env.TMDB_API_KEY}`,
    );
    const countries = releaseDatesRes.data?.results || [];
    const preferredCountries = ["FR", "BE", "CA", "US", "GB"];
    for (const iso of preferredCountries) {
      const country = countries.find((entry: any) => entry.iso_3166_1 === iso);
      const cert = country?.release_dates?.find(
        (date: any) =>
          typeof date.certification === "string" && date.certification.trim(),
      )?.certification;
      if (cert) {
        certification = iso === "FR" ? cert : `${iso} ${cert}`;
        break;
      }
    }
  } catch (err) {
    console.error(
      `[TMDB] Failed to fetch release dates for movie ID ${bestMatch.id}:`,
      err,
    );
  }

  const facts: MetadataFact[] = [];
  if (certification) {
    facts.push({
      kind: "age-rating",
      label: "Classification",
      value: certification,
      source: "tmdb",
      confidence: 0.78,
      priority: 75,
    });
  }
  if (typeof details.vote_average === "number" && details.vote_average > 0) {
    const rating = formatScore(details.vote_average, 10);
    if (rating) {
      facts.push({
        kind: "rating",
        label: "TMDB",
        value: rating,
        source: "tmdb",
        confidence: 0.72,
        priority: 80,
      });
    }
  }

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
    imageUrl: coverUrl,
    attachments: [
      ...(coverUrl && !tmdbPosters.some((p) => p.url === coverUrl)
        ? [
            {
              type: "cover" as const,
              url: coverUrl,
              source: "tmdb",
            },
          ]
        : []),
      ...tmdbPosters,
      ...(bestMatch.backdrop_path &&
      !tmdbBackdrops.some(
        (b) =>
          b.url ===
          `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`,
      )
        ? [
            {
              type: "background" as const,
              url: `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`,
              source: "tmdb",
            },
          ]
        : []),
      ...tmdbBackdrops,
      ...tmdbLogos,
    ],
    aliases,
    facts: facts.length > 0 ? facts : undefined,
  };
}

async function fetchFromTMDBSeries(name: string) {
  const intent = parseTMDBSeriesIntent(name);
  const searchUrl = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(intent.searchTitle)}&api_key=${process.env.TMDB_API_KEY}&language=fr-FR`;
  const res = await axios.get(searchUrl);
  const data = res.data;

  if (!data.results || data.results.length === 0) return null;

  const bestMatch = pickBestTMDBMatch(
    intent.searchTitle,
    data.results as TMDBSearchResult[],
  );
  if (!bestMatch) return null;

  const detailsRes = await axios.get(
    `https://api.themoviedb.org/3/tv/${bestMatch.id}?api_key=${process.env.TMDB_API_KEY}&language=fr-FR`,
  );
  const details = detailsRes.data;

  let seasonDetails: any | null = null;
  if (intent.seasonNumber) {
    try {
      const seasonRes = await axios.get(
        `https://api.themoviedb.org/3/tv/${bestMatch.id}/season/${intent.seasonNumber}?api_key=${process.env.TMDB_API_KEY}&language=fr-FR`,
      );
      seasonDetails = seasonRes.data;
    } catch (err) {
      console.error(
        `[TMDB] Failed to fetch season ${intent.seasonNumber} for TV ID ${bestMatch.id}:`,
        err,
      );
    }
  }

  let imagesData: {
    posters?: { file_path: string }[];
    backdrops?: { file_path: string }[];
    logos?: { file_path: string }[];
  } = {};
  try {
    const imagesRes = await axios.get(
      `https://api.themoviedb.org/3/tv/${bestMatch.id}/images?api_key=${process.env.TMDB_API_KEY}`,
    );
    imagesData = imagesRes.data;
  } catch (err) {
    console.error(
      `[TMDB] Failed to fetch images for TV ID ${bestMatch.id}:`,
      err,
    );
  }

  let seasonImagesData: { posters?: { file_path: string }[] } = {};
  if (intent.seasonNumber) {
    try {
      const seasonImagesRes = await axios.get(
        `https://api.themoviedb.org/3/tv/${bestMatch.id}/season/${intent.seasonNumber}/images?api_key=${process.env.TMDB_API_KEY}`,
      );
      seasonImagesData = seasonImagesRes.data;
    } catch (err) {
      console.error(
        `[TMDB] Failed to fetch season images for TV ID ${bestMatch.id}:`,
        err,
      );
    }
  }

  const seasonPosters = (seasonImagesData.posters || [])
    .slice(0, 20)
    .map((img: { file_path: string }) => ({
      type: "cover" as const,
      url: `https://image.tmdb.org/t/p/w780${img.file_path}`,
      source: "tmdb",
    }));

  const tmdbPosters = (imagesData.posters || [])
    .slice(0, 30)
    .map((img: { file_path: string }) => ({
      type: "cover" as const,
      url: `https://image.tmdb.org/t/p/w780${img.file_path}`,
      source: "tmdb",
    }));

  const tmdbBackdrops = (imagesData.backdrops || [])
    .slice(0, 30)
    .map((img: { file_path: string }) => ({
      type: "background" as const,
      url: `https://image.tmdb.org/t/p/w1280${img.file_path}`,
      source: "tmdb",
    }));

  const tmdbLogos = (imagesData.logos || [])
    .slice(0, 10)
    .map((img: { file_path: string }) => ({
      type: "logo" as const,
      url: `https://image.tmdb.org/t/p/w500${img.file_path}`,
      source: "tmdb",
    }));

  const seasonCoverUrl = seasonDetails?.poster_path
    ? `https://image.tmdb.org/t/p/w780${seasonDetails.poster_path}`
    : null;
  const coverUrl =
    seasonCoverUrl ||
    (bestMatch.poster_path
      ? `https://image.tmdb.org/t/p/w780${bestMatch.poster_path}`
      : null);

  let aliases: string[] = [];
  try {
    const titlesRes = await axios.get(
      `https://api.themoviedb.org/3/tv/${bestMatch.id}/alternative_titles?api_key=${process.env.TMDB_API_KEY}`,
    );
    aliases = (titlesRes.data?.results || [])
      .map((t: any) => (t.title || t.name) as string)
      .filter(Boolean)
      .filter(
        (t: string) =>
          t.toLowerCase().trim() !==
          String(details.name || bestMatch.name)
            .toLowerCase()
            .trim(),
      );
  } catch (err) {
    console.error(
      `[TMDB] Failed to fetch alternative titles for TV ID ${bestMatch.id}:`,
      err,
    );
  }

  let certification: string | null = null;
  try {
    const ratingsRes = await axios.get(
      `https://api.themoviedb.org/3/tv/${bestMatch.id}/content_ratings?api_key=${process.env.TMDB_API_KEY}`,
    );
    const countries = ratingsRes.data?.results || [];
    const preferredCountries = ["FR", "BE", "CA", "US", "GB"];
    for (const iso of preferredCountries) {
      const country = countries.find((entry: any) => entry.iso_3166_1 === iso);
      const rating =
        typeof country?.rating === "string" && country.rating.trim()
          ? country.rating
          : null;
      if (rating) {
        certification = iso === "FR" ? rating : `${iso} ${rating}`;
        break;
      }
    }
  } catch (err) {
    console.error(
      `[TMDB] Failed to fetch content ratings for TV ID ${bestMatch.id}:`,
      err,
    );
  }

  const facts: MetadataFact[] = [];
  if (certification) {
    facts.push({
      kind: "age-rating",
      label: "Classification",
      value: certification,
      source: "tmdb",
      confidence: 0.78,
      priority: 75,
    });
  }
  if (typeof details.vote_average === "number" && details.vote_average > 0) {
    const rating = formatScore(details.vote_average, 10);
    if (rating) {
      facts.push({
        kind: "rating",
        label: "TMDB",
        value: rating,
        source: "tmdb",
        confidence: 0.72,
        priority: 80,
      });
    }
  }

  const seriesTitle = details.name || bestMatch.name;
  const displayTitle = intent.seasonNumber
    ? `${seriesTitle} - Saison ${intent.seasonNumber}`
    : seriesTitle;
  const releaseDate = seasonDetails?.air_date || details.first_air_date;
  const runtime = Array.isArray(details.episode_run_time)
    ? details.episode_run_time.find(
        (value: unknown) => typeof value === "number" && value > 0,
      )
    : undefined;

  return {
    title: displayTitle,
    authors:
      details.created_by?.map(
        (person: { name: string; profile_path?: string | null }) => ({
          name: person.name,
          imageUrl: person.profile_path
            ? `https://image.tmdb.org/t/p/w780${person.profile_path}`
            : null,
        }),
      ) || [],
    publishers:
      details.production_companies?.map(
        (company: { name: string; logo_path?: string | null }) => ({
          name: company.name,
          imageUrl: company.logo_path
            ? `https://image.tmdb.org/t/p/w780${company.logo_path}`
            : null,
        }),
      ) || [],
    duration: runtime,
    description: seasonDetails?.overview || details.overview,
    releaseDate,
    imageUrl: coverUrl,
    attachments: [
      ...(coverUrl &&
      !seasonPosters.some((p) => p.url === coverUrl) &&
      !tmdbPosters.some((p) => p.url === coverUrl)
        ? [
            {
              type: "cover" as const,
              url: coverUrl,
              source: "tmdb",
            },
          ]
        : []),
      ...seasonPosters,
      ...tmdbPosters,
      ...(bestMatch.backdrop_path &&
      !tmdbBackdrops.some(
        (b) =>
          b.url ===
          `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`,
      )
        ? [
            {
              type: "background" as const,
              url: `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`,
              source: "tmdb",
            },
          ]
        : []),
      ...tmdbBackdrops,
      ...tmdbLogos,
    ],
    aliases,
    facts: facts.length > 0 ? facts : undefined,
  };
}

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
    const seriesIntent = parseTMDBSeriesIntent(name);
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
  fetchFromScreenScraper,
  fetchFromRawg,
  fetchFromBGG,
  fetchFromOpenLibrary,
  fetchFromTMDB,
  cleanSearchQuery,
};
