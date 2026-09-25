/**
 * Gallery rows for a printKey-bound item must stay on that print's game.
 *
 * **Client-safe** (no provider registry / Node). Membership for `/assets/…`
 * URLs is the path segment that matches the printKey game (Naruto, Kayou,
 * Lorcana, …) — nested packs like `/assets/naruto/kayou/…` still match
 * Kayou. Remote HTTPS covers stay here; the server registry filter
 * (`printKeyGallery.server`) drops foreign-game providers by `printGames`.
 */
import { parsePrintKey } from "@/core/identify/printKey";
import { urlsReferToSameLocalizedImage } from "@/core/enrich/media/coverUrl";
import type { MetadataAttachment, MetadataResult } from "@/types/metadataProvider";

const COVER_TYPES = new Set(["cover", "artwork", "image"]);

const PASSTHROUGH_SOURCES = new Set([
  "user",
  "barcode",
  "metadata",
  "scan",
]);

/**
 * Whether an `/assets/…` URL belongs to `game`. `null` = not a local pack URL
 * (remote / uploads) — caller decides.
 */
export function assetsUrlBelongsToPrintGame(
  url: string,
  game: string,
): boolean | null {
  const path = url.trim().split(/[?#]/, 1)[0] ?? "";
  if (!path.startsWith("/assets/")) return null;
  const segments = path
    .slice("/assets/".length)
    .split("/")
    .map((s) => {
      try {
        return decodeURIComponent(s).toLowerCase();
      } catch {
        return s.toLowerCase();
      }
    })
    .filter(Boolean);
  const g = game.trim().toLowerCase();
  if (!g) return null;
  return segments.includes(g);
}

export function attachmentBelongsToPrintGame(
  attachment: { source?: string | null; url?: string | null },
  game: string,
): boolean {
  const raw = attachment.source?.trim();
  if (raw && PASSTHROUGH_SOURCES.has(raw.toLowerCase())) return true;

  const url = attachment.url?.trim() ?? "";
  if (!url) return true;

  const assetsHit = assetsUrlBelongsToPrintGame(url, game);
  if (assetsHit !== null) return assetsHit;

  // Remote /uploads — client cannot map source → printGames without the
  // registry. Keep; server-side filter is authoritative on persist/preview.
  return true;
}

/**
 * Drop cover/artwork/image rows that clearly belong to another pack game via
 * `/assets/{game}/…`. Non-cover attachments and user/barcode rows pass through.
 */
export function filterAttachmentsForPrintKey<
  T extends { source?: string | null; type?: string | null; url?: string | null },
>(attachments: readonly T[] | null | undefined, printKey?: string | null): T[] {
  if (!attachments?.length) return attachments ? [...attachments] : [];
  const game = parsePrintKey(printKey)?.game?.trim().toLowerCase();
  if (!game) return [...attachments];

  return attachments.filter((attachment) => {
    if (attachment.type && !COVER_TYPES.has(attachment.type)) return true;
    return attachmentBelongsToPrintGame(attachment, game);
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

  const attachments = filterAttachmentsForPrintKey(
    metadata.attachments ?? [],
    printKey,
  );
  const imageUrl = metadata.imageUrl?.trim() || null;
  const imageStillAllowed =
    !imageUrl ||
    attachments.some((attachment) =>
      urlsReferToSameLocalizedImage(attachment.url, imageUrl),
    ) ||
    !(metadata.attachments ?? []).some(
      (attachment) =>
        urlsReferToSameLocalizedImage(attachment.url, imageUrl) &&
        !attachmentBelongsToPrintGame(attachment, game),
    );

  return {
    ...metadata,
    ...(imageStillAllowed ? {} : { imageUrl: attachments[0]?.url ?? null }),
    attachments,
  };
}

function sameGalleryUrl(left: string, right: string): boolean {
  return left === right || urlsReferToSameLocalizedImage(left, right);
}

/**
 * Images picker source for a printKey-bound edit: stored fiche ∪ printKey-scoped
 * preview, with foreign `/assets/` covers stripped. Preview local_catalog faces
 * fill in alternate `art.*` rows the fiche may not have persisted yet.
 */
export function metadataForPrintKeyImagePicker(
  stored: MetadataResult | null | undefined,
  preview: MetadataResult | null | undefined,
  printKey?: string | null,
): MetadataResult | null {
  const filteredStored = filterMetadataForPrintKey(stored, printKey);
  const filteredPreview = filterMetadataForPrintKey(preview, printKey);

  if (!printKey?.trim()) {
    return filteredStored ?? filteredPreview ?? null;
  }

  if (!filteredStored && !filteredPreview) return null;
  if (!filteredStored) return filteredPreview;
  if (!filteredPreview) return filteredStored;

  const attachments: MetadataAttachment[] = [
    ...(filteredStored.attachments ?? []),
  ];
  for (const incoming of filteredPreview.attachments ?? []) {
    if (!incoming.url) continue;
    if (
      attachments.some((existing) =>
        sameGalleryUrl(existing.url, incoming.url),
      )
    ) {
      continue;
    }
    attachments.push(incoming);
  }

  const imageUrl =
    filteredStored.imageUrl?.trim() ||
    filteredPreview.imageUrl?.trim() ||
    attachments[0]?.url ||
    null;

  return {
    ...filteredStored,
    ...filteredPreview,
    title: filteredStored.title ?? filteredPreview.title,
    imageUrl,
    attachments,
    externalIds: {
      ...(filteredPreview.externalIds ?? {}),
      ...(filteredStored.externalIds ?? {}),
      printKey: printKey.trim(),
    },
  };
}
