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
  pickBestCoverFromAttachments,
  rankAttachmentsForDisplay,
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
import {
  trimLightImageMargins,
  cropImageIfNeeded,
} from "@/lib/server/imageTrim";
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

function isDisplayImageAttachment(attachment: {
  type?: AttachmentType | string | null;
  url?: string | null;
}) {
  return (
    Boolean(attachment.url) &&
    ["cover", "artwork", "image", "screenshot", "background"].includes(
      String(attachment.type || ""),
    )
  );
}

function hasMetadataImageCandidate(metadata: MetadataResult) {
  if (metadata.imageUrl) return true;
  return Boolean(metadata.attachments?.some(isDisplayImageAttachment));
}

function canUseBarcodeCacheCover(
  cached: { shelfType?: string | null } | null,
  type: Type,
  metadata: MetadataResult,
) {
  return cached?.shelfType === type && !hasMetadataImageCandidate(metadata);
}

export { isMissingDiscogsGallery } from "@/lib/metadataDiscogs";

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

/**
 * Variante "originale" (pleine résolution, vrai ratio) d'une URL d'image
 * redimensionnée par PrestaShop/Philibert. Ces plateformes encodent la taille
 * via un segment `{id}-{taille}_default/` qui padde l'image en carré et la
 * sous-échantillonne ; le chemin nu `{id}/` sert le fichier d'origine. Renvoie
 * null quand l'URL ne suit pas ce motif (on ne touche donc que ces sources).
 */
export function retailerOriginalImageUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(
      /^\/(\d+)-[a-z0-9_]*_default\/([^/?#]+)$/i,
    );
    if (!match) return null;
    parsed.pathname = `/${match[1]}/${match[2]}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

const IMAGE_TRANSFORM_QUERY_PARAMS = new Set([
  "auto",
  "compress",
  "compression",
  "crop",
  "dpr",
  "fit",
  "fm",
  "format",
  "h",
  "height",
  "im",
  "imheight",
  "imwidth",
  "ixid",
  "ixlib",
  "mode",
  "pithumbsize",
  "q",
  "quality",
  "resize",
  "rs",
  "sharp",
  "thumb",
  "thumbnail",
  "thumbsize",
  "tr",
  "transform",
  "w",
  "width",
]);

function isImageTransformParam(param: string): boolean {
  const normalized = param.toLowerCase();
  return (
    IMAGE_TRANSFORM_QUERY_PARAMS.has(normalized) ||
    normalized.startsWith("crop") ||
    normalized.startsWith("resize")
  );
}

function imageUrlWithoutTransformArgs(url: string): string | null {
  try {
    const parsed = new URL(url);
    let changed = false;

    for (const key of Array.from(parsed.searchParams.keys())) {
      if (!isImageTransformParam(key)) continue;
      parsed.searchParams.delete(key);
      changed = true;
    }

    if (
      !changed &&
      (parsed.hostname.includes("cdn.pji.nu") ||
        parsed.hostname.includes("prisjakt.nu")) &&
      /\.(jpe?g|png|webp|gif|svg)$/i.test(parsed.pathname)
    ) {
      parsed.search = "";
      changed = true;
    }

    if (!changed) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function providerOriginalImageUrl(url: string): string | null {
  const retailerOriginal = retailerOriginalImageUrl(url);
  const baseUrl = retailerOriginal || url;
  const cleanUrl = imageUrlWithoutTransformArgs(baseUrl) || baseUrl;
  return cleanUrl !== url ? cleanUrl : null;
}

/**
 * URLs à tenter pour une image, dans l'ordre : l'original d'abord, puis la
 * variante redimensionnée en repli (certaines boutiques ne servent pas
 * l'original au chemin nu et renvoient 404).
 */
function imageDownloadCandidates(url: string): string[] {
  const original = providerOriginalImageUrl(url);
  return Array.from(new Set([original, url].filter(Boolean))) as string[];
}

async function downloadSingleImage(
  url: string,
  options: { trim?: boolean; minMarginPixels?: number },
): Promise<string | null> {
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
      let imageBuffer = Buffer.from(res.data);
      if (options.trim) {
        imageBuffer = await trimLightImageMargins(imageBuffer, {
          minMarginPixels: options.minMarginPixels,
        });
      }
      fs.writeFileSync(targetPath, imageBuffer);
      console.log(`[ImageLocalizer] Downloaded ${url} -> ${targetPath}`);
      return `/uploads/${filename}`;
    }
  } catch (err) {
    console.error(
      `[ImageLocalizer] Failed to download image from ${url}:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  return null;
}

export async function downloadRemoteImage(
  url: string,
  options: { trim?: boolean; minMarginPixels?: number } = {},
): Promise<string | null> {
  if (
    !url ||
    url.startsWith("/") ||
    url.startsWith("file://") ||
    !url.startsWith("http")
  ) {
    return url;
  }

  // Préfère l'original pleine résolution, avec repli sur la variante servie.
  for (const candidate of imageDownloadCandidates(url)) {
    const localized = await downloadSingleImage(candidate, options);
    if (localized) return localized;
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
      if (cached && canUseBarcodeCacheCover(cached, type, metadata)) {
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

  const imageMetricsByUrl = new Map<string, AttachmentImageMetrics | null>();
  await Promise.all(
    localizedAttachments
      .filter((attachment) =>
        shouldReadImageMetricsForAttachment(attachment.type),
      )
      .map(async (attachment) => {
        imageMetricsByUrl.set(
          attachment.url,
          await readAttachmentImageMetrics(attachment.url),
        );
      }),
  );

  const rankedLocalizedAttachments = await dedupeLocalizedAttachmentsByContent(
    rankAttachmentsForDisplay(localizedAttachments, imageMetricsByUrl),
  );
  const discogsCover = rankedLocalizedAttachments.find(
    (attachment) =>
      attachment.source === "discogs" && attachment.type === "cover",
  );
  const selectedImageUrl =
    discogsCover?.url ??
    pickBestCoverFromAttachments(
      rankedLocalizedAttachments,
      imageMetricsByUrl,
    ) ??
    formattedMetadata.imageUrl ??
    null;

  const croppedImageUrl = selectedImageUrl
    ? await cropImageIfNeeded(selectedImageUrl, { minMarginPixels: 30 })
    : null;

  metadata.imageUrl = croppedImageUrl || undefined;

  const metadataData = {
    ...formattedMetadata,
    imageUrl: croppedImageUrl,
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

  if (item && croppedImageUrl) {
    const previousMetadataImage = item.metadata?.imageUrl || null;
    const itemCoverStillInGallery = rankedLocalizedAttachments.some(
      (attachment) => attachment.url === item.imageUrl,
    );
    const shouldSyncItemCover =
      !item.imageUrl ||
      item.imageUrl === previousMetadataImage ||
      item.imageUrl === croppedImageUrl ||
      localizedAttachments.some(
        (attachment) =>
          attachment.source === "barcode" && attachment.url === item.imageUrl,
      ) ||
      (type === "musics" &&
        !itemCoverStillInGallery &&
        rankedLocalizedAttachments.some(
          (attachment) => attachment.source === "discogs",
        ));
    if (shouldSyncItemCover) {
      await prisma.item.update({
        where: { id: itemId },
        data: { imageUrl: croppedImageUrl },
      });
    }
  }

  return storedMetadata;
}
/**
 * Distance de Hamming entre deux empreintes perceptuelles, représentées en
 * chaîne binaire de même longueur (64 caractères "0"/"1").
 */
export function hammingDistance(a: string, b: string): number {
  let count = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) count++;
  }
  return count + Math.abs(a.length - b.length);
}

// Au-delà de cette distance, deux images sont considérées distinctes. Les copies
// d'une même jaquette (tailles/encodages différents) tombent bien en dessous ;
// deux visuels réellement différents sont très au-dessus.
const PERCEPTUAL_DUPLICATE_MAX_DISTANCE = 8;

/**
 * Déduplique des images visuellement identiques même servies à des URLs, des
 * tailles ou des encodages différents (ex. la même boîte chez 5 boutiques).
 * On garde la première occurrence : l'appelant fournit la liste triée par
 * pertinence, donc la meilleure copie de chaque visuel est conservée.
 * Générique à tous les types de média.
 */
export function dedupeByPerceptualHash<
  T extends { type: AttachmentType; url: string },
>(
  attachments: T[],
  hashOf: (url: string) => string | null,
  maxDistance: number = PERCEPTUAL_DUPLICATE_MAX_DISTANCE,
): T[] {
  const kept: string[] = [];
  const result: T[] = [];
  for (const attachment of attachments) {
    const hash = hashOf(attachment.url);
    if (hash === null) {
      result.push(attachment);
      continue;
    }
    if (
      kept.some((existing) => hammingDistance(existing, hash) <= maxDistance)
    ) {
      continue;
    }
    kept.push(hash);
    result.push(attachment);
  }
  return result;
}

const perceptualHashCache = new Map<string, Promise<string | null>>();

/**
 * Empreinte perceptuelle (dHash 64 bits, en chaîne binaire) d'un asset local :
 * niveaux de gris réduits en 9×8, chaque pixel comparé à son voisin de droite.
 * Mémoïsée.
 */
async function perceptualHashForAsset(url: string): Promise<string | null> {
  if (!url || !url.startsWith("/")) return null;
  const cached = perceptualHashCache.get(url);
  if (cached) return cached;

  const task = (async () => {
    const filePath = resolvePublicAssetPath(url);
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      const { data, info } = await sharp(filePath)
        .greyscale()
        .resize(9, 8, { fit: "fill" })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const channels = info.channels;
      let hash = "";
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const left = data[(row * 9 + col) * channels];
          const right = data[(row * 9 + col + 1) * channels];
          hash += left < right ? "1" : "0";
        }
      }
      return hash;
    } catch {
      return null;
    }
  })();

  perceptualHashCache.set(url, task);
  if (perceptualHashCache.size > IMAGE_METRICS_CACHE_LIMIT) {
    const oldestKey = perceptualHashCache.keys().next().value;
    if (typeof oldestKey === "string") perceptualHashCache.delete(oldestKey);
  }
  return task;
}

async function dedupeLocalizedAttachmentsByContent<
  T extends { type: AttachmentType; url: string },
>(attachments: T[]): Promise<T[]> {
  const hashByUrl = new Map<string, string>();
  await Promise.all(
    attachments.map(async (attachment) => {
      if (!shouldReadImageMetricsForAttachment(attachment.type)) return;
      const hash = await perceptualHashForAsset(attachment.url);
      if (hash !== null) hashByUrl.set(attachment.url, hash);
    }),
  );
  return dedupeByPerceptualHash(
    attachments,
    (url) => hashByUrl.get(url) ?? null,
  );
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
