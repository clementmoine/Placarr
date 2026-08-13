/**
 * Non-replayable Naruto ledgers / faces live under `curated/` (git).
 * Recoverable scrape output stays under `data/naruto/ccg/`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROVIDER_DIR = path.dirname(fileURLToPath(import.meta.url));

export function narutoCuratedDir(): string {
  return path.join(PROVIDER_DIR, "curated");
}

export function narutoCuratedSourcesDir(): string {
  return path.join(narutoCuratedDir(), "sources");
}

export function narutoCuratedReconstructedDir(): string {
  return path.join(narutoCuratedDir(), "reconstructed");
}

/** Authenticated collector photos used as reconstruct inputs (git). */
export function narutoCuratedReconstructedSourcePhotosDir(): string {
  return path.join(narutoCuratedReconstructedDir(), "source-photos");
}
