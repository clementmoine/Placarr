import path from "node:path";

/** Shared curated checklists — server-only (`node:path`). */
export function leclercCuratedDir(): string {
  return path.join(process.cwd(), "src", "providers", "leclerc", "curated");
}
