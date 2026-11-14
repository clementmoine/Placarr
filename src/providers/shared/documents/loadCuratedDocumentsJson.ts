/**
 * Shared loader for pack `curated/documents*.json` sidecars.
 *
 * Each pack keeps a thin `load*CuratedDocuments` that points at
 * `import.meta.url` (+ optional extra files). JSON shape stays
 * {@link CuratedPackDocument}.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CuratedPackDocument } from "@/lib/admin/packDocuments";

/**
 * Read one or more curated document lists next to the caller module.
 * Missing files are skipped (empty list when nothing is on disk).
 */
export function loadCuratedDocumentsJson(
  importMetaUrl: string,
  files: readonly string[] = ["documents.json"],
): CuratedPackDocument[] {
  const dir = path.dirname(fileURLToPath(importMetaUrl));
  const out: CuratedPackDocument[] = [];
  for (const name of files) {
    const file = path.join(dir, name);
    if (!existsSync(file)) continue;
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (Array.isArray(raw)) {
      out.push(...(raw as CuratedPackDocument[]));
    }
  }
  return out;
}
