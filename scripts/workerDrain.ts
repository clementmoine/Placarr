/**
 * Drain borné du worker (rechargement dev, {@link ./superviseDevWorkerLogic}).
 *
 * Sur le signal de drain, le worker ne prend plus de job et laisse finir ceux
 * en cours — mais pas indéfiniment : passé `WORKER_DRAIN_TIMEOUT_MS`, il
 * interrompt les jobs encore en vol (signal → ALS HTTP + frontières d'étape),
 * les rend à `pending` et sort pour que le superviseur relance le code neuf.
 * Une Sync interrompue reprend à l'étape suivante (`completedSteps`) ou depuis
 * le début ; un job annulé, lui, s'arrête de toute façon dès sa sonde.
 * ADR-003, addendum 2026-11-23.
 */

/** Assez pour finir une étape courte, trop court pour attendre une Sync. */
export const DEFAULT_WORKER_DRAIN_TIMEOUT_MS = 10 * 60 * 1000;

export function resolveWorkerDrainTimeoutMs(
  env: Record<string, string | undefined>,
): number {
  const raw = Number.parseInt(env.WORKER_DRAIN_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0
    ? raw
    : DEFAULT_WORKER_DRAIN_TIMEOUT_MS;
}

export type WorkerDrain = {
  /** Aborts when the deadline passes — handed to every in-flight job. */
  signal: AbortSignal;
  /** In-flight jobs ended on their own: drop the deadline. */
  settle: () => void;
};

export function startWorkerDrain(opts: {
  timeoutMs: number;
  log: (line: string) => void;
}): WorkerDrain {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    opts.log(
      `drain deadline reached after ${Math.round(opts.timeoutMs / 1000)}s — interrupting in-flight jobs, releasing them to pending`,
    );
    controller.abort(new Error("worker drain deadline"));
  }, opts.timeoutMs);
  if (typeof timer.unref === "function") timer.unref();
  return {
    signal: controller.signal,
    settle: () => clearTimeout(timer),
  };
}
