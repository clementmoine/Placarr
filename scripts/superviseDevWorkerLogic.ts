/**
 * Pure helpers for {@link ./superviseDevWorker.ts}.
 * Kept separate so vitest can import them without spawning a worker.
 */

export const RESTART_BASE_MS = 1_000;
export const RESTART_MAX_MS = 30_000;
/** Child lived this long → treat next crash as a fresh failure streak. */
export const HEALTHY_RUN_MS = 60_000;

const IGNORE_PATH_PARTS = [
  "/data/",
  "/.next/",
  "/node_modules/",
  "/.git/",
] as const;

export function nextBackoffMs(
  failureStreak: number,
  baseMs = RESTART_BASE_MS,
  maxMs = RESTART_MAX_MS,
): number {
  const capped = Math.max(0, failureStreak);
  return Math.min(maxMs, baseMs * 2 ** capped);
}

/**
 * Match the old `tsx watch` excludes (any `data`, `.next`, `node_modules` segment).
 * Paths are compared with forward slashes so Windows + POSIX agree.
 */
export function shouldIgnoreWatchPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  if (!normalized.endsWith(".ts") && !normalized.endsWith(".tsx")) {
    return true;
  }
  // Tests / test helpers are never imported by the worker: editing them must
  // not restart a multi-hour Sync.
  if (/\.test\.tsx?$/.test(normalized)) return true;
  if (/(^|\/)tests\//.test(normalized)) return true;
  return IGNORE_PATH_PARTS.some((part) => normalized.includes(part));
}

/**
 * Asks the worker to finish its in-flight jobs, claim nothing new, then exit
 * so the supervisor can respawn it on fresh code. SIGTERM stays the hard stop
 * (releases running jobs back to pending — a Sync then restarts from zero).
 */
export const WORKER_DRAIN_SIGNAL = "SIGUSR2" as const;

/**
 * `node --import tsx <entry>` rather than the tsx CLI: the CLI relays only
 * SIGINT/SIGTERM, so {@link WORKER_DRAIN_SIGNAL} would kill it and orphan the
 * worker.
 */
export function workerSpawnCommand(
  nodeBin: string,
  entry: string,
): { command: string; args: string[] } {
  return { command: nodeBin, args: ["--import", "tsx", entry] };
}

export function shouldResetFailureStreak(
  livedMs: number,
  healthyRunMs = HEALTHY_RUN_MS,
): boolean {
  return livedMs >= healthyRunMs;
}
