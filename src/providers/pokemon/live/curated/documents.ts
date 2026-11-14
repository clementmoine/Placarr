import type { CuratedPackDocument } from "@/lib/admin/packDocuments";
import { loadCuratedDocumentsJson } from "@/providers/shared/documents/loadCuratedDocumentsJson";

/** Seed URLs + local official checklists → `data/pokemon/documents/`. */
export function loadPokemonCuratedDocuments(): CuratedPackDocument[] {
  return loadCuratedDocumentsJson(import.meta.url, [
    "documents.json",
    "documents-checklists.json",
  ]);
}
