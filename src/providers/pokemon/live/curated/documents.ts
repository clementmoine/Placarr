import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CuratedPackDocument } from "@/lib/admin/packDocuments";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function loadJson(name: string): CuratedPackDocument[] {
  const file = path.join(HERE, name);
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, "utf8")) as CuratedPackDocument[];
  return Array.isArray(raw) ? raw : [];
}

/** Seed URLs + local official checklists → `data/pokemon/documents/`. */
export function loadPokemonCuratedDocuments(): CuratedPackDocument[] {
  return [...loadJson("documents.json"), ...loadJson("documents-checklists.json")];
}
