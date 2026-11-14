import type { MetadataResult } from "@/types/metadataProvider";

/**
 * Accept a scan/modal metadata preview for immediate persistence on create.
 * Rejects empty/garbage payloads so we never wipe the item with a hollow row.
 */
export function asSeedableMetadataPreview(
  value: unknown,
): MetadataResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const imageUrl =
    typeof record.imageUrl === "string" ? record.imageUrl.trim() : "";
  const attachments = Array.isArray(record.attachments)
    ? record.attachments
    : [];

  if (!title && !imageUrl && attachments.length === 0) {
    return null;
  }

  return value as MetadataResult;
}
