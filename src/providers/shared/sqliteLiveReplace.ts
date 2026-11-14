/**
 * Atomic replace of a live SQLite catalog file.
 *
 * Writers often build into `*.tmp` / `*.building` then rename over the live
 * path. With WAL journal mode that leaves `-wal`/`-shm` pointing at the old
 * inode → every reader sees SQLITE_CORRUPT / "malformed". One rule: drop
 * sidecars around the swap.
 */
import { existsSync, renameSync, unlinkSync } from "node:fs";

/** Best-effort drop of WAL / SHM / rollback-journal sidecars next to `dbPath`. */
export function unlinkSqliteSidecars(dbPath: string): void {
  for (const side of [
    `${dbPath}-wal`,
    `${dbPath}-shm`,
    `${dbPath}-journal`,
  ]) {
    try {
      unlinkSync(side);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Move `buildPath` onto `livePath`, clearing WAL sidecars before and after.
 * Callers must have closed every Database handle on `livePath` first.
 */
export function replaceSqliteLiveFile(
  livePath: string,
  buildPath: string,
): void {
  unlinkSqliteSidecars(livePath);
  if (existsSync(livePath)) {
    try {
      unlinkSync(livePath);
    } catch {
      /* rename may still overwrite on same filesystem */
    }
  }
  renameSync(buildPath, livePath);
  unlinkSqliteSidecars(livePath);
}
