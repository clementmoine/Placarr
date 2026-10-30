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
  return IGNORE_PATH_PARTS.some((part) => normalized.includes(part));
}

export function shouldResetFailureStreak(
  livedMs: number,
  healthyRunMs = HEALTHY_RUN_MS,
): boolean {
  return livedMs >= healthyRunMs;
}
