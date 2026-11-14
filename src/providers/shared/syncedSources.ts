/**
 * Pack synced ledgers under `data/<pack>/sources/`.
 *
 * Contract (ADR-006):
 * - {@link syncedSourcePath} — **write** target, always under `dataRoot()`
 * - {@link sourcePath} — **read** path, prefers `dataRoot()`, falls back to
 *   repo `cwd/data/<pack>/sources/` when the override tree is empty
 *
 * Keep these helpers out of modules imported by the effects client graph
 * (`pack.ts` constants OK; `node:fs` via `@/lib/packPaths` is not).
 */
import {
  packSyncedSourcePath,
  resolvePackSyncedSourcePath,
} from "@/lib/packPaths";

export type PackSyncedSourceHelpers = {
  /** Write target — `dataRoot()/<pack>/sources/<file>`. */
  syncedSourcePath: (fileName: string) => string;
  /** Read path — dataRoot first, then repo `cwd/data` fallback. */
  sourcePath: (fileName: string) => string;
};

export function definePackSyncedSources(
  packId: string,
): PackSyncedSourceHelpers {
  return {
    syncedSourcePath: (fileName: string) =>
      packSyncedSourcePath(packId, fileName),
    sourcePath: (fileName: string) =>
      resolvePackSyncedSourcePath(packId, fileName),
  };
}
