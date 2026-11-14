import type { CuratedPackDocument } from "@/lib/admin/packDocuments";
import { loadCuratedDocumentsJson } from "@/providers/shared/documents/loadCuratedDocumentsJson";

/**
 * Data Carddass mission leaflets (`mission/room`, NM-*) staged under carddass
 * → `data/naruto/data-carddass/documents/`.
 */
export function loadDataCarddassCuratedDocuments(): CuratedPackDocument[] {
  return loadCuratedDocumentsJson(import.meta.url);
}
