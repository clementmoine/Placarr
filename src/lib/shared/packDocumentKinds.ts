/**
 * Document kinds — client-safe (no fs). Disk helpers live in
 * `@/lib/admin/packDocuments`.
 */

export const PACK_DOCUMENT_KINDS = [
  "rulebook",
  "set_notes",
  "checklist",
  "op",
  "penalty",
  "brand",
  "other",
] as const;

export type PackDocumentKind = (typeof PACK_DOCUMENT_KINDS)[number];

const KIND_SET = new Set<string>(PACK_DOCUMENT_KINDS);

export function isPackDocumentKind(value: unknown): value is PackDocumentKind {
  return typeof value === "string" && KIND_SET.has(value);
}
