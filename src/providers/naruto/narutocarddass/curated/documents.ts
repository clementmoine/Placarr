import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CuratedPackDocument } from "@/lib/admin/packDocuments";
import { packDataDir } from "@/lib/packPaths";
import { loadCuratedDocumentsJson } from "@/providers/shared/documents/loadCuratedDocumentsJson";

import { NARUTO_PACK_ID } from "../packs";

/** Hand-made / irreplaceable bytes next to this module → staged under data. */
const CURATED_DOCUMENTS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "documents",
);

/** Pack-relative destination for {@link stageCarddassCuratedDocumentFiles}. */
export const CURATED_DOCUMENTS_STAGED_REL = "sources/curated-documents";

/**
 * Copy committed `curated/documents/*.{png,jpg,webp,pdf}` into
 * `data/naruto/carddass/sources/curated-documents/` so harvest `localPath`
 * resolves (ADR-006 : originals stay in curated, not only under gitignored data).
 */
export function stageCarddassCuratedDocumentFiles(): { staged: string[] } {
  const staged: string[] = [];
  if (!existsSync(CURATED_DOCUMENTS_DIR)) return { staged };

  const destRoot = path.join(
    packDataDir(NARUTO_PACK_ID),
    CURATED_DOCUMENTS_STAGED_REL,
  );
  mkdirSync(destRoot, { recursive: true });

  for (const name of readdirSync(CURATED_DOCUMENTS_DIR)) {
    if (!/\.(png|jpe?g|webp|pdf)$/i.test(name)) continue;
    const src = path.join(CURATED_DOCUMENTS_DIR, name);
    try {
      if (!statSync(src).isFile()) continue;
    } catch {
      continue;
    }
    copyFileSync(src, path.join(destRoot, name));
    staged.push(`${CURATED_DOCUMENTS_STAGED_REL}/${name}`);
  }
  return { staged };
}

/** Staging PDFs (carddass.fr + carddas.com) + curated posters → `data/…/documents/`. */
export function loadCarddassCuratedDocuments(): CuratedPackDocument[] {
  return loadCuratedDocumentsJson(import.meta.url);
}
