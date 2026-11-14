import type { MetadataResult } from "@/types/metadataProvider";

export function metadataHasDisplayImage(metadata: MetadataResult): boolean {
  if (metadata.imageUrl?.trim()) return true;
  return Boolean(
    metadata.attachments?.some((attachment) => attachment.url?.trim()),
  );
}
