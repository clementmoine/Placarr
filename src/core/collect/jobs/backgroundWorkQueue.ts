import { AsyncQueue } from "@/lib/async/asyncQueue";
import { yieldToEventLoop } from "@/lib/async/yieldToEventLoop";

/**
 * Residual in-process pools for work that still runs inside Next or the worker
 * process (not the DB job queue). Metadata enrich + price refresh enqueue to
 * `BackgroundWorkJob` and run in `pnpm worker`.
 *
 * - Pool I/O (`runBackgroundWork`) : rare same-process tasks.
 * - Pool CPU (`runCpuBackgroundWork`) : image localization / `sharp`.
 *
 * Defaults stay modest; raise via BACKGROUND_IO_CONCURRENCY /
 * BACKGROUND_CPU_CONCURRENCY only if Flare and the host keep up.
 * Job-level parallelism lives on `WORKER_CONCURRENCY` (out-of-process worker).
 */
const DEFAULT_BACKGROUND_IO_CONCURRENCY = 4;
const DEFAULT_BACKGROUND_CPU_CONCURRENCY = 2;

function resolveConcurrency(envNames: string[], fallback: number): number {
  for (const name of envNames) {
    const raw = Number.parseInt(process.env[name] || "", 10);
    if (Number.isFinite(raw) && raw > 0) return raw;
  }
  return fallback;
}

const ioQueue = new AsyncQueue(
  resolveConcurrency(
    ["BACKGROUND_IO_CONCURRENCY", "BACKGROUND_WORK_CONCURRENCY"],
    DEFAULT_BACKGROUND_IO_CONCURRENCY,
  ),
);

const cpuQueue = new AsyncQueue(
  resolveConcurrency(
    ["BACKGROUND_CPU_CONCURRENCY"],
    DEFAULT_BACKGROUND_CPU_CONCURRENCY,
  ),
);

async function runYielding<T>(fn: () => Promise<T>): Promise<T> {
  await yieldToEventLoop();
  try {
    return await fn();
  } finally {
    await yieldToEventLoop();
  }
}

/** Travail d'arrière-plan I/O (fetch providers, refresh de prix). */
export function runBackgroundWork<T>(fn: () => Promise<T>): Promise<T> {
  return ioQueue.run(() => runYielding(fn));
}

/** Travail d'arrière-plan CPU (localisation d'images / `sharp`). */
export function runCpuBackgroundWork<T>(fn: () => Promise<T>): Promise<T> {
  return cpuQueue.run(() => runYielding(fn));
}
