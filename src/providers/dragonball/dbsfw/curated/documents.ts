import type { CuratedPackDocument } from "@/lib/admin/packDocuments";
import { loadCuratedDocumentsJson } from "@/providers/shared/documents/loadCuratedDocumentsJson";

/** Official Bandai Fusion World rules PDFs → `data/dragonball/fw/documents/`. */
export function loadDbsFwCuratedDocuments(): CuratedPackDocument[] {
  return loadCuratedDocumentsJson(import.meta.url);
}
