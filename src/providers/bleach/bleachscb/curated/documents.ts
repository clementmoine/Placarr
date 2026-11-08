import type { CuratedPackDocument } from "@/lib/admin/packDocuments";
import { loadCuratedDocumentsJson } from "@/providers/shared/documents/loadCuratedDocumentsJson";

/** carddass.fr/bleach docs via Wayback → `data/bleach/scb/documents/`. */
export function loadBleachScbCuratedDocuments(): CuratedPackDocument[] {
  return loadCuratedDocumentsJson(import.meta.url);
}
