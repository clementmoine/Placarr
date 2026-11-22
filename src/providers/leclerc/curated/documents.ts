import type { CuratedPackDocument } from "@/lib/admin/packDocuments";
import { loadCuratedDocumentsJson } from "@/providers/shared/documents/loadCuratedDocumentsJson";

/**
 * Documents d'une opération Leclerc (règlement, liste des magasins,
 * catalogues, bannières) → `data/leclerc/<set>/documents/`. Liste par
 * opération : `curated/documents/<set>.json`.
 */
export function loadLeclercCuratedDocuments(
  setCode: string,
): CuratedPackDocument[] {
  return loadCuratedDocumentsJson(import.meta.url, [
    `documents/${setCode}.json`,
  ]);
}
