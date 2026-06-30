export type GameMediaGalleryAttachment = {
  type: string;
  isGameMediaGallerySource?: boolean;
};

export type MusicGalleryAttachment = {
  type: string;
  isMusicGallerySource?: boolean;
};

export function hasGameMediaGalleryAttachment(
  attachments: readonly Record<string, unknown>[],
): boolean {
  return attachments.some(
    (attachment) => attachment.isGameMediaGallerySource === true,
  );
}

/** Video-game items with a barcode but no gallery attachments may need re-enrichment. */
export function isMissingGameMediaGallery(
  type: string,
  barcode: string | null | undefined,
  attachments: readonly GameMediaGalleryAttachment[],
): boolean {
  if (type !== "games" || !barcode?.trim()) return false;
  if (hasGameMediaGalleryAttachment(attachments)) return false;

  const displayAttachments = attachments.filter((attachment) =>
    ["cover", "image", "artwork", "screenshot", "background"].includes(
      attachment.type,
    ),
  );
  return displayAttachments.length <= 1;
}

export function hasMusicGalleryAttachment(
  attachments: readonly MusicGalleryAttachment[],
): boolean {
  return attachments.some(
    (attachment) => attachment.isMusicGallerySource === true,
  );
}

/** Music items with only a single cover should be re-enriched for sleeve scans. */
export function isMissingMusicGallery(
  type: string,
  barcode: string | null | undefined,
  attachments: readonly MusicGalleryAttachment[],
): boolean {
  if (type !== "musics" || !barcode?.trim()) return false;
  if (hasMusicGalleryAttachment(attachments)) return false;

  const displayAttachments = attachments.filter((attachment) =>
    ["cover", "image", "artwork"].includes(attachment.type),
  );
  return displayAttachments.length <= 1;
}
