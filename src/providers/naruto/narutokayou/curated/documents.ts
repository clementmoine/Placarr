import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CuratedPackDocument } from "@/lib/admin/packDocuments";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Kayou drive PDFs staged under carddass → `data/naruto/kayou/documents/`. */
export function loadKayouCuratedDocuments(): CuratedPackDocument[] {
  const file = path.join(HERE, "documents.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as CuratedPackDocument[];
  return Array.isArray(raw) ? raw : [];
}
