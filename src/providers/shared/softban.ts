/**
 * Soft-ban cooldown, persisted across runs.
 *
 * A host that answers 403/429/503 is not saying "no such file", it is saying
 * "stop". Two packs learned that the expensive way — the Pokémon CDN scrape
 * under parallel load, then the DBS faces pass — so the state lives here
 * rather than in either of them.
 *
 * Persisted on purpose: an in-memory flag only protects the run that got
 * banned. The next run starts innocent, hammers the same host, and extends the
 * block. On disk, the cooldown outlives the process.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

/** Statuses that mean "slow down", never "not found". */
export const SOFTBAN_STATUSES = new Set([403, 429, 503]);

export function isSoftbanStatus(status: number | undefined): boolean {
  return status != null && SOFTBAN_STATUSES.has(status);
}

export type SoftbanState = {
  until: string;
  reason: string;
  writtenAt: string;
};

function logsDir(cacheRoot: string): string {
  return path.join(cacheRoot, "logs");
}

export function softbanStatePath(cacheRoot: string, name = "cdn"): string {
  return path.join(logsDir(cacheRoot), `${name}-softban-until.json`);
}

export function readSoftbanState(
  cacheRoot: string,
  name?: string,
): SoftbanState | null {
  const file = softbanStatePath(cacheRoot, name);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as SoftbanState;
    if (!raw?.until) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeSoftbanState(
  cacheRoot: string,
  opts: { until: Date; reason: string; name?: string },
): SoftbanState {
  mkdirSync(logsDir(cacheRoot), { recursive: true });
  const state: SoftbanState = {
    until: opts.until.toISOString(),
    reason: opts.reason,
    writtenAt: new Date().toISOString(),
  };
  writeFileSync(
    softbanStatePath(cacheRoot, opts.name),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );
  return state;
}

export function clearSoftbanState(cacheRoot: string, name?: string): void {
  const file = softbanStatePath(cacheRoot, name);
  if (existsSync(file)) unlinkSync(file);
}

/** Cooldown still to run, in ms — `0` when clear. */
export function softbanRemainingMs(
  cacheRoot: string,
  now = Date.now(),
  name?: string,
): number {
  const state = readSoftbanState(cacheRoot, name);
  if (!state) return 0;
  const until = Date.parse(state.until);
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - now);
}
