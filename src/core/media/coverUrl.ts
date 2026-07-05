/** Normalizes a localized cover path so crop derivatives match their source file. */
export function stripCropSuffixFromUrl(url: string): string {
  return url.replace(/_crop(\.[^.]+)$/, "$1");
}

export function urlsReferToSameLocalizedImage(a: string, b: string): boolean {
  return stripCropSuffixFromUrl(a) === stripCropSuffixFromUrl(b);
}

const COVER_ELIGIBLE_ATTACHMENT_TYPES = new Set(["cover", "artwork", "image"]);

/** True for attachment types that may serve as the default box cover. */
export function isCoverEligibleAttachmentType(type?: string | null): boolean {
  return Boolean(type && COVER_ELIGIBLE_ATTACHMENT_TYPES.has(type));
}

export function findAttachmentForUrl<
  T extends { type?: string | null; url?: string | null },
>(attachments: readonly T[], url: string): T | undefined {
  return attachments.find(
    (attachment) =>
      attachment.url && urlsReferToSameLocalizedImage(attachment.url, url),
  );
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
