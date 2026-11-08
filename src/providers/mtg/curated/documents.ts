import type { CuratedPackDocument } from "@/lib/admin/packDocuments";
import { loadCuratedDocumentsJson } from "@/providers/shared/documents/loadCuratedDocumentsJson";

/** Official Wizards MTG rules PDFs → `data/mtg/documents/`. */
export function loadMtgCuratedDocuments(): CuratedPackDocument[] {
  return loadCuratedDocumentsJson(import.meta.url);
}
