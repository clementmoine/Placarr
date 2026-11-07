import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CuratedPackDocument } from "@/lib/admin/packDocuments";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Official Konami Yu-Gi-Oh! rules PDFs → `data/yugioh/documents/`. */
export function loadYugiohCuratedDocuments(): CuratedPackDocument[] {
  const file = path.join(HERE, "documents.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as CuratedPackDocument[];
  return Array.isArray(raw) ? raw : [];
}
