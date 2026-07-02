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
  shouldShowCoverAttachmentOnShelf,
  pickBestBackgroundFromAttachments,
  pickBestCoverFromAttachments,
  rankAttachmentsForDisplay,
  rankCoverGalleryAttachments,
  reorderAttachmentsCoverFirst,
  rankScoredAttachments,
  scoreAttachmentForDisplay,
  type AttachmentImageMetrics,
  type AttachmentDisplayScoreOptions,
  type ScoredAttachmentInput,
} from "@/lib/media/attachmentDisplayScore";
import { detectShelfGamePlatformKey } from "@/lib/metadata/platform";
import { catalogAttachmentTitleConflicts } from "@/lib/metadata/titleMatching";
import { urlsReferToSameLocalizedImage } from "@/lib/media/coverUrl";
import { resolveAttachmentDisplayRegion } from "@/lib/media/attachmentDisplayLabels";
import { looksLikeImageBuffer } from "@/lib/media/imageBuffer";
import { coverDownloadCandidates } from "@/lib/media/coverDownloadCandidates";
import { fetchRemoteImageBuffer } from "@/lib/media/remoteFetch";
import {
  MIN_COVER_SHORTEST_EDGE,
  readFileImageMetrics,
  shortestImageEdge,
  isCoverResolutionAcceptable,
} from "@/lib/media/imageMetrics";
import { resolveCoverAttachmentRole } from "@/lib/media/coverPerspective";
import { measureCoverExposureFromBuffer } from "@/lib/media/coverExposure.server";
import {
  isMissingArtImageUrl,
  isPlaceholderCoverImage,
} from "@/lib/media/coverPlaceholder";
import { regionRank } from "@/lib/locale/preference";
import { applyConsensus } from "@/lib/metadata/consensus";
import { isMetadataTitleAligned } from "@/lib/metadata/titleMatching";
import { barcodeListingMatchesItem } from "@/lib/barcode/titleUtils";
import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import { PROVIDERS, inferImageAttachmentFromMediaUrl } from "@/services/provider/registry";
import {
  authoritative3dCoverRoleSource,
  canonicalProviderIdForSource,
  coverProvenanceForSource,
  gridStyleCoverLabelSource,
  isCanonicalCoverSource,
  withProviderAttachmentTraits,
} from "@/services/provider/sourceTraits";
import { prisma } from "@/lib/db/prisma";
import {
  dedupeFacts,
  metadataFieldEvidence,
  normalizeMetadataFacts,
} from "@/services/metadata/facts";
import {
  trimLightImageMargins,
  cropImageIfNeeded,
} from "@/lib/media/imageTrim";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type { Item } from "@prisma/client";
import { replaceFieldEvidence } from "@/services/metadata/evidence";

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
  attachments?.map((attachment) =>
    withProviderAttachmentTraits({
      type: attachment.type,
      title: attachment.title ?? undefined,
      duration: attachment.duration ?? undefined,
      url: attachment.url,
      role: attachment.role ?? undefined,
      source: attachment.source ?? undefined,
      coverProvenance: attachment.coverProvenance ?? undefined,
      // Persisted image metrics → read-time cover ranking (no re-decode on load).
      width: attachment.width ?? undefined,
      height: attachment.height ?? undefined,
      meanLuminance: attachment.meanLuminance ?? undefined,
      darkPixelRatio: attachment.darkPixelRatio ?? undefined,
    }),
  ) ?? [];

/**
 * Project a scored/ranked attachment down to the columns the `Attachment` table
 * actually has, dropping derived display-only fields (e.g. the provider cover
 * trait flags) so Prisma `create` does not reject unknown args.
 */
const toAttachmentCreateData = (
  attachment: {
    type: AttachmentType;
    title?: string | null;
    duration?: number | null;
    url: string;
    role?: string | null;
    source?: string | null;
    coverProvenance?: string | null;
  },
  metrics?: AttachmentImageMetrics | null,
) => ({
  type: attachment.type,
  title: attachment.title ?? undefined,
  duration: attachment.duration ?? undefined,
  url: attachment.url,
  role: attachment.role ?? undefined,
  source: attachment.source ?? undefined,
  coverProvenance: attachment.coverProvenance ?? undefined,
  // Persist the metrics measured during this enrichment so the read-time cover
  // ranking can reorder the gallery from stored data (no refresh required).
  width: metrics?.width ?? null,
  height: metrics?.height ?? null,
  meanLuminance: metrics?.meanLuminance ?? null,
  darkPixelRatio: metrics?.darkPixelRatio ?? null,
});

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

export function metadataImageAttachmentSemantics(
  metadata: MetadataResult,
  originalImageUrl: string,
): Pick<MetadataAttachment, "type" | "role" | "source" | "title"> | null {
  const direct = metadata.attachments?.find(
    (attachment) => attachment.url === originalImageUrl,
  );
  const inferred = inferImageAttachmentFromMediaUrl(originalImageUrl);

  if (!direct && !inferred) return null;

  return {
    type: direct?.type ?? inferred?.type ?? "cover",
    role: direct?.role ?? inferred?.role,
    source: direct?.source ?? inferred?.source,
    title: direct?.title,
  };
}

function canUseBarcodeCacheCover(
  cached: { shelfType?: string | null; rawNames?: Array<{ value: string; coverUrl?: string | null }> } | null,
  type: Type,
  metadata: MetadataResult,
  itemName: string,
  inferredCoverSemantics?: Pick<
    MetadataAttachment,
    "type" | "role" | "source" | "title"
  > | null,
) {
  if (cached?.shelfType !== type) return false;
  const barcodeListing = cached?.rawNames?.find((entry) => entry.coverUrl)?.value;
  if (
    barcodeListing &&
    !barcodeListingMatchesItem(itemName, barcodeListing)
  ) {
    return false;
  }
  if (!hasMetadataImageCandidate(metadata)) return true;
  return Boolean(inferredCoverSemantics?.source && inferredCoverSemantics.role);
}

function providerMatchesImageUrl(
  provider: { coverUrlHost?: string | null },
  url: string,
): boolean {
  if (!provider.coverUrlHost) return false;
  return url.includes(provider.coverUrlHost);
}

function remoteImageFallbackProviderFor(url: string, source?: string | null) {
  const sourceProviderId = canonicalProviderIdForSource(source);
  if (sourceProviderId) {
    const provider = PROVIDERS.find((p) => p.id === sourceProviderId);
    if (
      provider?.remoteImageFallback &&
      providerMatchesImageUrl(provider, url)
    ) {
      return provider;
    }
  }

  return PROVIDERS.find(
    (provider) =>
      provider.remoteImageFallback && providerMatchesImageUrl(provider, url),
  );
}

export function canKeepRemoteImageOnDownloadFailure(
  url: string,
  source?: string | null,
): boolean {
  if (!url || url.startsWith("/") || !/^https?:\/\//i.test(url)) return false;
  return Boolean(remoteImageFallbackProviderFor(url, source));
}

export { isMissingMusicGallery } from "@/lib/metadata/galleries";

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
    heroImageUrl: metadata.heroImageUrl || undefined,
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

export { looksLikeImageBuffer } from "@/lib/media/imageBuffer";

const LOCAL_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

async function existingLocalizedUploadForUrl(
  url: string,
): Promise<string | null> {
  const targetDir = path.join(process.cwd(), "public", "uploads");
  const candidates = coverDownloadCandidates(url);

  for (const candidate of candidates) {
    const hash = crypto.createHash("md5").update(candidate).digest("hex");
    for (const ext of LOCAL_IMAGE_EXTENSIONS) {
      const targetPath = path.join(targetDir, `${hash}${ext}`);
      if (!fs.existsSync(targetPath)) continue;
      const metrics = await readFileImageMetrics(targetPath);
      const shortest = shortestImageEdge(metrics);
      if (shortest === 0 || shortest >= MIN_COVER_SHORTEST_EDGE) {
        return `/uploads/${hash}${ext}`;
      }
    }
  }

  return null;
}

export async function syncCroppedCoverAttachment(
  metadataId: string,
  croppedImageUrl: string,
  previousImageUrl?: string | null,
): Promise<void> {
  if (!croppedImageUrl.startsWith("/uploads/")) return;

  const attachments = await prisma.attachment.findMany({
    where: { metadataId },
  });

  const match = attachments.find(
    (attachment) =>
      urlsReferToSameLocalizedImage(attachment.url, croppedImageUrl) ||
      (previousImageUrl &&
        urlsReferToSameLocalizedImage(attachment.url, previousImageUrl)),
  );

  if (!match || match.url === croppedImageUrl) return;

  await prisma.attachment.update({
    where: { id: match.id },
    data: { url: croppedImageUrl },
  });

  const metadata = await prisma.metadata.findUnique({
    where: { id: metadataId },
    select: { imageUrl: true },
  });
  if (
    metadata?.imageUrl &&
    urlsReferToSameLocalizedImage(metadata.imageUrl, croppedImageUrl)
  ) {
    await prisma.metadata.update({
      where: { id: metadataId },
      data: { imageUrl: croppedImageUrl },
    });
  }
}

export async function downloadRemoteImage(
  url: string,
  options: { trim?: boolean; minMarginPixels?: number } = {},
): Promise<string | null> {
  if (!url) return null;
  if (isMissingArtImageUrl(url)) return null;
  if (url.startsWith("file://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return url.startsWith("/uploads/") ? url : null;
  }
  if (!url.startsWith("http")) {
    return null;
  }

  const existingLocalized = await existingLocalizedUploadForUrl(url);
  if (existingLocalized) {
    return existingLocalized;
  }

  try {
    const hash = crypto.createHash("md5").update(url).digest("hex");
    const targetDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const original = providerOriginalImageUrl(url);
    const fetched =
      (await fetchRemoteImageBuffer(url)) ||
      (original && original !== url
        ? await fetchRemoteImageBuffer(original)
        : null);
    if (!fetched) {
      return (await existingLocalizedUploadForUrl(url)) ?? null;
    }

    const parsedUrl = new URL(fetched.sourceUrl);
    let ext = path.extname(parsedUrl.pathname);
    if (
      !ext ||
      ![".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(
        ext.toLowerCase(),
      )
    ) {
      ext = ".jpg";
    }

    const filename = `${hash}${ext}`;
    const targetPath = path.join(targetDir, filename);
    if (fs.existsSync(targetPath)) {
      const metrics = await readFileImageMetrics(targetPath);
      const shortest = shortestImageEdge(metrics);
      if (shortest === 0 || shortest >= MIN_COVER_SHORTEST_EDGE) {
        return `/uploads/${filename}`;
      }
    }

    let imageBuffer = fetched.buffer;
    if (options.trim) {
      imageBuffer = await trimLightImageMargins(imageBuffer, {
        minMarginPixels: options.minMarginPixels,
      });
    }
    fs.writeFileSync(targetPath, imageBuffer);
    console.log(
      `[ImageLocalizer] Downloaded ${fetched.sourceUrl} -> ${targetPath}`,
    );
    return `/uploads/${filename}`;
  } catch (err) {
    console.error(
      `[ImageLocalizer] Failed to download image from ${url}:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
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
  const originalMetadataImageUrl = metadata.imageUrl;
  const metadataImageSemantics = originalMetadataImageUrl
    ? metadataImageAttachmentSemantics(metadata, originalMetadataImageUrl)
    : null;

  if (metadata.imageUrl) {
    metadata.imageUrl = (await downloadRemoteImage(metadata.imageUrl)) || undefined;
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
      shelf: { select: { name: true, type: true } },
      metadata: {
        include: { attachments: true, authors: true, publishers: true },
      },
    },
  });

  const requestedPlatformKey =
    type === "games"
      ? detectShelfGamePlatformKey(item?.shelf?.name)
      : undefined;

  const attachmentsList = [...(metadata.attachments || [])];
  if (metadata.imageUrl) {
    const exists = attachmentsList.some(
      (attachment) => attachment.url === metadata.imageUrl,
    );
    if (!exists) {
      attachmentsList.unshift({
        type: metadataImageSemantics?.type ?? "cover",
        url: metadata.imageUrl,
        role: metadataImageSemantics?.role,
        source: metadataImageSemantics?.source ?? "merged",
        title: metadataImageSemantics?.title,
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
        const barcodeCoverSemantics = barcodeCover
          ? metadataImageAttachmentSemantics(
              { imageUrl: barcodeCover },
              barcodeCover,
            )
          : null;
        if (
          barcodeCover &&
          canUseBarcodeCacheCover(
            cached,
            type,
            metadata,
            name,
            barcodeCoverSemantics,
          )
        ) {
          const exists = attachmentsList.some((a) => a.url === barcodeCover);
          if (!exists) {
            attachmentsList.unshift({
              type: barcodeCoverSemantics?.type ?? ("cover" as AttachmentType),
              url: barcodeCover,
              role: barcodeCoverSemantics?.role,
              source: barcodeCoverSemantics?.source ?? "barcode",
              title: barcodeCoverSemantics?.title,
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
  const downloadedAttachments = (
    await Promise.all(
      uniqueAttachments.map(async (attachment) => {
        const sourceUrl = attachment.url;
        const localizedUrl = await downloadRemoteImage(attachment.url);
        if (!localizedUrl) {
          return null;
        }

        let role = attachment.role;
        if (attachment.type === "cover") {
          role =
            resolveCoverAttachmentRole({
              type: attachment.type,
              url: sourceUrl,
              title: attachment.title,
              role: attachment.role,
              source: attachment.source,
              authoritative3dCoverRoleSource: authoritative3dCoverRoleSource(
                attachment.source,
              ),
              gridStyleCoverLabelsSource: gridStyleCoverLabelSource(
                attachment.source,
              ),
            }) ?? role;
        }

        return {
          ...attachment,
          url: localizedUrl,
          role,
          // Resolve provenance from the ORIGINAL provider URL before it is
          // replaced by the local /uploads path, then persist it: the localized
          // URL no longer reveals the source bucket (catalog vs seller/user
          // photo), so it cannot be recomputed on read.
          coverProvenance:
            coverProvenanceForSource(attachment.source, sourceUrl) ??
            attachment.coverProvenance,
        };
      }),
    )
  ).filter((a): a is NonNullable<typeof a> => a !== null);

  // Reject solid-colour / near-uniform placeholder images (e.g. ScreenScraper
  // fillers, Geedie "no artwork" glyphs) so they never pollute the gallery or
  // get picked as the cover.
  let localizedAttachments = await filterOutFlatImageAttachments(
    downloadedAttachments,
  );

  if (localizedAttachments.length === 0 && item?.metadata?.attachments?.length) {
    localizedAttachments = item.metadata.attachments
      .filter((attachment) => attachment.url.startsWith("/uploads/"))
      .map((attachment) => ({
        type: attachment.type,
        url: attachment.url,
        role: attachment.role ?? undefined,
        source: attachment.source ?? "merged",
        title: attachment.title ?? undefined,
        coverProvenance: attachment.coverProvenance ?? undefined,
      }));
  }

  const previousLocalCoverRaw =
    item?.metadata?.imageUrl?.startsWith("/uploads/")
      ? item.metadata.imageUrl
      : item?.imageUrl?.startsWith("/uploads/")
        ? item.imageUrl
        : null;
  const previousLocalCover =
    previousLocalCoverRaw &&
    isCoverResolutionAcceptable(
      await readFileImageMetrics(
        path.join(process.cwd(), "public", previousLocalCoverRaw),
      ),
    )
      ? previousLocalCoverRaw
      : null;

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

  // Stamp the provider-declared cover traits onto each attachment so the display
  // scorer (and the client, via the stored payload) ranks the box cover / full
  // wrap signals without reading the registry.
  const rankedLocalizedAttachments = await dedupeLocalizedAttachmentsByContent(
    reorderAttachmentsCoverFirst(
      rankAttachmentsForDisplay(
        localizedAttachments.map(withProviderAttachmentTraits),
        imageMetricsByUrl,
        { requestedPlatformKey },
      ),
      imageMetricsByUrl,
      { requestedPlatformKey },
    ),
  );
  const storableAttachments = (
    requestedPlatformKey
      ? rankedLocalizedAttachments.filter(
          (attachment) =>
            !["cover", "artwork", "image"].includes(attachment.type) ||
            shouldShowCoverAttachmentOnShelf(attachment, requestedPlatformKey),
        )
      : rankedLocalizedAttachments
  ).filter((attachment) => {
    if (!["cover", "artwork", "image"].includes(attachment.type)) return true;
    if (!attachment.title?.trim()) return true;
    if (!attachment.retailCatalogImageTitlesSource) {
      return true;
    }
    const catalogTitle = formattedMetadata.title || name;
    return !catalogAttachmentTitleConflicts(catalogTitle, attachment.title);
  });
  const canonicalCoverCandidate = storableAttachments.find(
    (attachment) =>
      attachment.isCanonicalCoverSource && attachment.type === "cover",
  );
  const canonicalCover =
    canonicalCoverCandidate &&
    isCoverResolutionAcceptable(
      imageMetricsByUrl.get(canonicalCoverCandidate.url) ?? null,
    )
      ? canonicalCoverCandidate
      : undefined;
  const selectedImageUrl =
    canonicalCover?.url ??
    pickBestCoverFromAttachments(
      storableAttachments,
      imageMetricsByUrl,
      { requestedPlatformKey },
    ) ??
    formattedMetadata.imageUrl ??
    previousLocalCover ??
    null;

  const croppedImageUrl = selectedImageUrl
    ? await cropImageIfNeeded(selectedImageUrl, { minMarginPixels: 30 })
    : null;

  // Cropping writes a new "_crop" file, so the cover URL stored on the item /
  // metadata would no longer match any gallery attachment. Repoint the source
  // attachment at the cropped file so the cover keeps its provenance
  // (source + region role) instead of surfacing as an orphan "Scan" image.
  if (
    croppedImageUrl &&
    selectedImageUrl &&
    croppedImageUrl !== selectedImageUrl
  ) {
    const coverAttachment = storableAttachments.find(
      (attachment) => attachment.url === selectedImageUrl,
    );
    if (coverAttachment) coverAttachment.url = croppedImageUrl;
  }

  metadata.imageUrl = croppedImageUrl || undefined;

  // Computed wide hero/background: the sharpest landscape image we have (reuses
  // the display scorer + the metrics already gathered above). Null when nothing
  // high-resolution qualifies, so the UI falls back to the legacy heuristic.
  const heroImageUrl = pickBestBackgroundFromAttachments(
    storableAttachments,
    imageMetricsByUrl,
  );
  metadata.heroImageUrl = heroImageUrl || undefined;

  const metadataData = {
    ...formattedMetadata,
    imageUrl: croppedImageUrl,
    heroImageUrl,
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
          create: storableAttachments.map((attachment) =>
            toAttachmentCreateData(
              attachment,
              imageMetricsByUrl.get(attachment.url),
            ),
          ),
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
          create: storableAttachments.map((attachment) =>
            toAttachmentCreateData(
              attachment,
              imageMetricsByUrl.get(attachment.url),
            ),
          ),
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
    const itemCoverStillInGallery = storableAttachments.some(
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
        storableAttachments.some(
          (attachment) => attachment.isCanonicalCoverSource,
        ));
    if (shouldSyncItemCover) {
      await prisma.item.update({
        where: { id: itemId },
        data: { imageUrl: croppedImageUrl },
      });
    }
  } else if (item && previousLocalCover && !item.imageUrl) {
    await prisma.item.update({
      where: { id: itemId },
      data: { imageUrl: previousLocalCover },
    });
  }

  const discoveredBarcode = normalizeProductBarcode(metadata.barcode);
  const itemName = name.trim() || item?.name?.trim() || "";
  if (
    item &&
    discoveredBarcode &&
    !normalizeProductBarcode(item.barcode) &&
    itemName &&
    metadata.title &&
    isMetadataTitleAligned({ title: metadata.title }, [itemName], 0.58)
  ) {
    await prisma.item.update({
      where: { id: itemId },
      data: { barcode: discoveredBarcode },
    });
  }

  if (item && heroImageUrl) {
    const previousHero = item.metadata?.heroImageUrl || null;
    const shouldSyncBackground =
      !item.backgroundImageUrl ||
      item.backgroundImageUrl === previousHero ||
      item.backgroundImageUrl === heroImageUrl;
    if (shouldSyncBackground) {
      await prisma.item.update({
        where: { id: itemId },
        data: { backgroundImageUrl: heroImageUrl },
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
  // Lower = keep. When two images are visually identical, the one with the
  // smaller preference rank is kept as the representative (used to keep the most
  // valuable region instead of an arbitrary first-seen one).
  preferenceOf?: (item: T) => number,
  // When set, perceptual duplicates are only collapsed within the same group.
  // Metadata storage uses per-provider groups so gallery sources (Geedie,
  // LaunchBox, …) stay visible even when box art matches another provider.
  sameGroup?: (item: T) => string,
): T[] {
  const kept: Array<{ hash: string; resultIndex: number; group: string }> = [];
  const result: T[] = [];
  for (const attachment of attachments) {
    const hash = hashOf(attachment.url);
    if (hash === null) {
      result.push(attachment);
      continue;
    }
    const group = sameGroup?.(attachment) ?? "";
    const duplicate = kept.find(
      (entry) =>
        entry.group === group &&
        hammingDistance(entry.hash, hash) <= maxDistance,
    );
    if (duplicate) {
      if (
        preferenceOf &&
        preferenceOf(attachment) < preferenceOf(result[duplicate.resultIndex])
      ) {
        // Same visual, better region: swap it in (keeps its url + role) without
        // changing the slot's display order.
        result[duplicate.resultIndex] = attachment;
        duplicate.hash = hash;
      }
      continue;
    }
    kept.push({ hash, resultIndex: result.length, group });
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
  T extends {
    type: AttachmentType;
    url: string;
    role?: string | null;
    source?: string | null;
  },
>(attachments: T[]): Promise<T[]> {
  const hashByUrl = new Map<string, string>();
  const metricsByUrl = new Map<string, AttachmentImageMetrics | null>();
  await Promise.all(
    attachments.map(async (attachment) => {
      if (!shouldReadImageMetricsForAttachment(attachment.type)) return;
      const hash = await perceptualHashForAsset(attachment.url);
      if (hash !== null) hashByUrl.set(attachment.url, hash);
      metricsByUrl.set(
        attachment.url,
        await readAttachmentImageMetrics(attachment.url),
      );
    }),
  );
  return dedupeByPerceptualHash(
    attachments,
    (url) => hashByUrl.get(url) ?? null,
    PERCEPTUAL_DUPLICATE_MAX_DISTANCE,
    (item) => {
      const metrics = metricsByUrl.get(item.url) ?? null;
      const resolutionPenalty = isCoverResolutionAcceptable(metrics) ? 0 : 1_000;
      return (
        resolutionPenalty +
        regionRank(
          resolveAttachmentDisplayRegion({ type: item.type, role: item.role }),
        )
      );
    },
    (item) => item.source ?? "merged",
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
      const buffer = fs.readFileSync(filePath);
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height) return null;
      const exposure = await measureCoverExposureFromBuffer(buffer);
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        meanLuminance: exposure?.meanLuminance,
        darkPixelRatio: exposure?.darkPixelRatio,
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

const flatImageAssetCache = new Map<string, Promise<boolean>>();

async function isFlatImageAsset(url: string): Promise<boolean> {
  if (!url || !url.startsWith("/")) return false;
  const cached = flatImageAssetCache.get(url);
  if (cached) return cached;

  const task = (async () => {
    const filePath = resolvePublicAssetPath(url);
    if (!filePath || !fs.existsSync(filePath)) return false;
    try {
      const buffer = fs.readFileSync(filePath);
      const stats = await sharp(buffer).stats();
      const metadata = await sharp(buffer).metadata();
      const exposure = await measureCoverExposureFromBuffer(buffer);
      const colorChannels = stats.channels.slice(0, 3);
      const maxColorStdev = Math.max(
        0,
        ...colorChannels.map((channel) => channel.stdev),
      );
      return isPlaceholderCoverImage({
        entropy: stats.entropy ?? 0,
        maxColorStdev,
        width: metadata.width,
        height: metadata.height,
        meanLuminance: exposure?.meanLuminance,
        darkPixelRatio: exposure?.darkPixelRatio,
      });
    } catch {
      return false;
    }
  })();

  flatImageAssetCache.set(url, task);
  if (flatImageAssetCache.size > IMAGE_METRICS_CACHE_LIMIT) {
    const oldestKey = flatImageAssetCache.keys().next().value;
    if (typeof oldestKey === "string") flatImageAssetCache.delete(oldestKey);
  }
  return task;
}

/**
 * Drop image-type attachments whose downloaded asset is a degenerate flat
 * placeholder. Non-image attachments (audio, etc.) pass through untouched.
 */
async function filterOutFlatImageAttachments<
  T extends { type: AttachmentType; url: string },
>(attachments: T[]): Promise<T[]> {
  const flatChecks = await Promise.all(
    attachments.map(async (attachment) => ({
      url: attachment.url,
      flat:
        shouldReadImageMetricsForAttachment(attachment.type) &&
        (await isFlatImageAsset(attachment.url)),
    })),
  );
  const flatUrls = new Set(
    flatChecks.filter((check) => check.flat).map((check) => check.url),
  );
  return attachments.filter((attachment) => !flatUrls.has(attachment.url));
}
