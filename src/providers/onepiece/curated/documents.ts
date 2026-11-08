import type { CuratedPackDocument } from "@/lib/admin/packDocuments";
import { loadCuratedDocumentsJson } from "@/providers/shared/documents/loadCuratedDocumentsJson";

/** Official Bandai OP rules PDFs → `data/onepiece/documents/`. */
export function loadOnepieceCuratedDocuments(): CuratedPackDocument[] {
  return loadCuratedDocumentsJson(import.meta.url);
}
