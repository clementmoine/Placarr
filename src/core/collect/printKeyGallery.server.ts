/**
 * Server-only printKey gallery filter — uses registry `printGames` so remote
 * HTTPS covers from another TCG (name-substring contamination) are dropped on
 * persist / API preview. Do not import from Client Components.
 */
import {
  getProviderModule,
  providerIdForSourceToken,
} from "@/core/catalog/catalog";
import { parsePrintKey } from "@/core/identify/printKey";
import {
  attachmentBelongsToPrintGame as attachmentBelongsViaAssetsUrl,
  filterAttachmentsForPrintKey as filterAttachmentsByAssetsUrl,
  filterMetadataForPrintKey as filterMetadataByAssetsUrl,
} from "@/core/collect/printKeyGallery";
import { urlsReferToSameLocalizedImage } from "@/core/enrich/media/coverUrl";
import type { MetadataAttachment } from "@/types/metadataProvider";

const COVER_TYPES = new Set(["cover", "artwork", "image"]);

const PASSTHROUGH_SOURCES = new Set([
  "user",
  "barcode",
  "metadata",
  "scan",
]);

function attachmentBelongsViaRegistry(
  attachment: { source?: string | null; url?: string | null },
  game: string,
): boolean {
  const raw = attachment.source?.trim();
  if (!raw) {
    // No source — fall back to `/assets/` path when present.
    return attachmentBelongsViaAssetsUrl(attachment, game);
  }
  if (PASSTHROUGH_SOURCES.has(raw.toLowerCase())) return true;

  const providerId = providerIdForSourceToken(raw);
  const mdl = getProviderModule(providerId);
  const printGames = mdl?.printGames;
  // Non-print providers (retailers, scans, …) stay — only drop providers that
  // claim a different card game.
  if (!printGames?.length) return true;
  return printGames.some(
    (printGame) => printGame.trim().toLowerCase() === game,
  );
}

export function filterAttachmentsForPrintKey<
  T extends { source?: string | null; type?: string | null; url?: string | null },
>(attachments: readonly T[] | null | undefined, printKey?: string | null): T[] {
  if (!attachments?.length) return attachments ? [...attachments] : [];
  const game = parsePrintKey(printKey)?.game?.trim().toLowerCase();
  if (!game) return [...attachments];

  // URL pack path first (cheap, catches /assets/lorcana on a naruto: item).
  const byUrl = filterAttachmentsByAssetsUrl(attachments, printKey);

  return byUrl.filter((attachment) => {
    if (attachment.type && !COVER_TYPES.has(attachment.type)) return true;
    return attachmentBelongsViaRegistry(attachment, game);
  });
}

export function filterMetadataForPrintKey<
  T extends {
    imageUrl?: string | null;
    attachments?: MetadataAttachment[] | null;
    externalIds?: Record<string, string | null | undefined> | null;
  },
>(metadata: T | null | undefined, printKey?: string | null): T | null {
  if (!metadata) return null;
  const game = parsePrintKey(printKey)?.game?.trim().toLowerCase();
  if (!game) return metadata;

  // Start from URL-scoped metadata, then re-filter attachments with registry.
  const urlScoped = filterMetadataByAssetsUrl(metadata, printKey);
  if (!urlScoped) return null;

  const attachments = filterAttachmentsForPrintKey(
    urlScoped.attachments ?? [],
    printKey,
  );
  const imageUrl = urlScoped.imageUrl?.trim() || null;
  const imageStillAllowed =
    !imageUrl ||
    attachments.some((attachment) =>
      urlsReferToSameLocalizedImage(attachment.url, imageUrl),
    ) ||
    !(urlScoped.attachments ?? []).some(
      (attachment) =>
        urlsReferToSameLocalizedImage(attachment.url, imageUrl) &&
        !attachmentBelongsViaRegistry(attachment, game),
    );

  return {
    ...urlScoped,
    ...(imageStillAllowed ? {} : { imageUrl: attachments[0]?.url ?? null }),
    attachments,
  };
}

export { metadataForPrintKeyImagePicker } from "@/core/collect/printKeyGallery";
