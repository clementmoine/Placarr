import type { CuratedPackDocument } from "@/lib/admin/packDocuments";
import { loadCuratedDocumentsJson } from "@/providers/shared/documents/loadCuratedDocumentsJson";

/** Official Konami Yu-Gi-Oh! rules PDFs → `data/yugioh/documents/`. */
export function loadYugiohCuratedDocuments(): CuratedPackDocument[] {
  return loadCuratedDocumentsJson(import.meta.url);
}
