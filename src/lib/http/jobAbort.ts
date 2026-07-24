/**
 * Job-scoped AbortSignal via AsyncLocalStorage.
 * Worker timeouts abort in-flight scrapes (axios / Flare) without threading
 * `signal` through every provider call site.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const jobAbortAls = new AsyncLocalStorage<AbortSignal>();

export function runWithJobAbortSignal<T>(
  signal: AbortSignal,
  fn: () => Promise<T>,
): Promise<T> {
  return jobAbortAls.run(signal, fn);
}

/** Active job abort signal, if any. */
export function getJobAbortSignal(): AbortSignal | undefined {
  return jobAbortAls.getStore();
}

/** Prefer an explicit signal; fall back to the job ALS. */
export function resolveRequestAbortSignal(
  explicit?: AbortSignal | null,
): AbortSignal | undefined {
  return explicit ?? getJobAbortSignal();
}

export function throwIfJobAborted(signal?: AbortSignal | null): void {
  const active = resolveRequestAbortSignal(signal);
  if (active?.aborted) {
    const reason = active.reason;
    if (reason instanceof Error) throw reason;
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }
}
