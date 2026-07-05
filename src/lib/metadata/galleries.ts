export type GameMediaGalleryAttachment = {
  type: string;
  isGameMediaGallerySource?: boolean;
};

export type MusicGalleryAttachment = {
  type: string;
  isMusicGallerySource?: boolean;
};

export function hasGameMediaGalleryAttachment(
  attachments: readonly {
    type?: string;
    source?: string | null;
    isGameMediaGallerySource?: boolean;
  }[],
): boolean {
  return attachments.some(
    (attachment) => attachment.isGameMediaGallerySource === true,
  );
}

/** Video-game items with a sparse gallery may need re-enrichment. */
export function isMissingGameMediaGallery(
  type: string,
  _barcode: string | null | undefined,
  attachments: readonly GameMediaGalleryAttachment[],
): boolean {
  if (type !== "games") return false;
  if (hasGameMediaGalleryAttachment(attachments)) return false;

  const displayAttachments = attachments.filter((attachment) =>
    ["cover", "image", "artwork", "screenshot", "background"].includes(
      attachment.type,
    ),
  );
  return displayAttachments.length <= 1;
}

export type BookGalleryAttachment = {
  type: string;
  isBookGallerySource?: boolean;
  isGameMediaGallerySource?: boolean;
};

export function hasBookGalleryAttachment(
  attachments: readonly BookGalleryAttachment[],
): boolean {
  return attachments.some(
    (attachment) =>
      attachment.isBookGallerySource === true ||
      attachment.isGameMediaGallerySource === true,
  );
}

/** Book items without retailer gallery assets may need re-enrichment. */
export function isMissingBookGallery(
  type: string,
  _barcode: string | null | undefined,
  attachments: readonly BookGalleryAttachment[],
): boolean {
  if (type !== "books") return false;
  if (hasBookGalleryAttachment(attachments)) return false;
  return true;
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
  _barcode: string | null | undefined,
  attachments: readonly MusicGalleryAttachment[],
): boolean {
  if (type !== "musics") return false;
  if (hasMusicGalleryAttachment(attachments)) return false;

  const displayAttachments = attachments.filter((attachment) =>
    ["cover", "image", "artwork"].includes(attachment.type),
  );
  return displayAttachments.length <= 1;
}
