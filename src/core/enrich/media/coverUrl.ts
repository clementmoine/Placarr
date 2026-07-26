/** Normalizes a localized cover path so crop derivatives match their source file. */
/**
 * The original a derived crop came from. Query strings are dropped first: a
 * re-crop overwrites the same filename, so the UI appends a cache-busting
 * `?v=` to force a refetch — that suffix must never make two URLs look like
 * different images.
 */
export function stripCropSuffixFromUrl(url: string): string {
  return url
    .split("?")[0]
    .split("#")[0]
    .replace(/_crop(\.[^.]+)$/, "$1");
}

export function urlsReferToSameLocalizedImage(a: string, b: string): boolean {
  return stripCropSuffixFromUrl(a) === stripCropSuffixFromUrl(b);
}

const COVER_ELIGIBLE_ATTACHMENT_TYPES = new Set(["cover", "artwork", "image"]);

/** True for attachment types that may serve as the default box cover. */
export function isCoverEligibleAttachmentType(type?: string | null): boolean {
  return Boolean(type && COVER_ELIGIBLE_ATTACHMENT_TYPES.has(type));
}

function attachmentSourceKey(source?: string | null): string {
  return (source || "").split(/[·/]/)[0].toLowerCase().trim();
}

/**
 * Match a display URL to a gallery row. When several rows share the same file
 * (honor pin + catalog provider), prefer the catalog source so chips keep
 * Booknode / ScreenScraper instead of a synthetic "Perso".
 */
export function findAttachmentForUrl<
  T extends {
    type?: string | null;
    url?: string | null;
    source?: string | null;
  },
>(attachments: readonly T[], url: string): T | undefined {
  const matches = attachments.filter(
    (attachment) =>
      attachment.url && urlsReferToSameLocalizedImage(attachment.url, url),
  );
  if (matches.length === 0) return undefined;
  const catalog = matches.find((attachment) => {
    const key = attachmentSourceKey(attachment.source);
    return key.length > 0 && key !== "user";
  });
  return catalog ?? matches[0];
}

/** Backgrounds/logos must not become the pinned default cover. */
export function isUrlEligibleDefaultCover<
  T extends { type?: string | null; url?: string | null },
>(url: string | null | undefined, attachments: readonly T[]): boolean {
  if (!url) return false;
  const match = findAttachmentForUrl(attachments, url);
  if (!match) return true;
  return isCoverEligibleAttachmentType(match.type);
}
