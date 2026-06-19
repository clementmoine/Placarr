import {
  Attachment,
  AttachmentType,
  Author,
  Metadata,
  Publisher,
  Type,
} from "@prisma/client";
import axios from "axios";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import {
  pickBestDisplayImageUrl,
  rankScoredAttachments,
  scoreAttachmentForDisplay,
  type AttachmentImageMetrics,
  type ScoredAttachmentInput,
} from "@/lib/attachmentDisplayScore";
import { applyConsensus } from "@/lib/metadataConsensus";
import { prisma } from "@/lib/prisma";
import {
  dedupeFacts,
  metadataFieldEvidence,
  normalizeMetadataFacts,
} from "@/services/metadataFacts";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
import type { Item } from "@prisma/client";
import { replaceFieldEvidence } from "@/services/evidence";

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
export async function getCachedMetadata(
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
export async function storeMetadata(
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
  if (metadata.imageUrl) {
    const exists = attachmentsList.some(
      (attachment) => attachment.url === metadata.imageUrl,
    );
    if (!exists) {
      attachmentsList.unshift({
        type: "cover",
        url: metadata.imageUrl,
        source: "merged",
      });
    }
  }
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

  const rankedLocalizedAttachments =
    await rankLocalizedAttachmentsForDisplay(localizedAttachments);
  const selectedImageUrl =
    pickBestDisplayImageUrl(rankedLocalizedAttachments) ??
    formattedMetadata.imageUrl ??
    null;
  metadata.imageUrl = selectedImageUrl || undefined;

  const metadataData = {
    ...formattedMetadata,
    imageUrl: selectedImageUrl,
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
          create: rankedLocalizedAttachments,
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
          create: rankedLocalizedAttachments,
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
function isPcLikeGamePlatform(platform?: string | null): boolean {
  if (!platform) return false;
  const normalized = platform
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(pc|windows|steam)\b/.test(normalized);
}

const imageMetricsCache = new Map<
  string,
  Promise<AttachmentImageMetrics | null>
>();
const IMAGE_METRICS_CACHE_LIMIT = 1500;

function shouldReadImageMetricsForAttachment(type: AttachmentType): boolean {
  return (
    type === "cover" ||
    type === "artwork" ||
    type === "image" ||
    type === "screenshot" ||
    type === "background"
  );
}

function resolvePublicAssetPath(url: string): string | null {
  if (!url || !url.startsWith("/")) return null;
  const cleanPath = url.split("?")[0]?.replace(/^\/+/, "");
  if (!cleanPath) return null;
  const safePath = cleanPath.replace(/\.\.(\/|\\)/g, "");
  return path.join(process.cwd(), "public", safePath);
}

export async function readAttachmentImageMetrics(
  url: string,
): Promise<AttachmentImageMetrics | null> {
  if (!url || !url.startsWith("/")) return null;
  const cached = imageMetricsCache.get(url);
  if (cached) return cached;

  const task = (async () => {
    const filePath = resolvePublicAssetPath(url);
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      const metadata = await sharp(filePath).metadata();
      if (!metadata.width || !metadata.height) return null;
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
      };
    } catch {
      return null;
    }
  })();

  imageMetricsCache.set(url, task);
  if (imageMetricsCache.size > IMAGE_METRICS_CACHE_LIMIT) {
    const oldestKey = imageMetricsCache.keys().next().value;
    if (typeof oldestKey === "string") {
      imageMetricsCache.delete(oldestKey);
    }
  }
  return task;
}

async function rankLocalizedAttachmentsForDisplay<
  T extends ScoredAttachmentInput,
>(attachments: T[]): Promise<T[]> {
  const scoredEntries: Array<{ attachment: T; score: number; index: number }> =
    [];
  const batchSize = 8;
  for (let offset = 0; offset < attachments.length; offset += batchSize) {
    const batch = attachments.slice(offset, offset + batchSize);
    const batchEntries = await Promise.all(
      batch.map(async (attachment, batchIndex) => {
        const metrics = shouldReadImageMetricsForAttachment(attachment.type)
          ? await readAttachmentImageMetrics(attachment.url)
          : null;
        return {
          attachment,
          index: offset + batchIndex,
          score: scoreAttachmentForDisplay(attachment, metrics),
        };
      }),
    );
    scoredEntries.push(...batchEntries);
  }
  return rankScoredAttachments(scoredEntries);
}
