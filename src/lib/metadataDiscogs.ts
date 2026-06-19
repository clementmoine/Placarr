export function isMissingDiscogsGallery(
  type: string,
  barcode: string | null | undefined,
  attachments: Array<{ source?: string | null; type: string }>,
): boolean {
  if (type !== "musics" || !barcode?.trim()) return false;
  if (attachments.some((attachment) => attachment.source === "discogs")) {
    return false;
  }
  const displayAttachments = attachments.filter((attachment) =>
    ["cover", "image", "artwork"].includes(attachment.type),
  );
  return displayAttachments.length <= 1;
}
