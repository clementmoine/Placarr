/**
 * Annulation coopérative d'un job de la file (ADR-003, addendum 2026-11-23).
 *
 * Un job marqué `cancelled` en base doit s'arrêter **pendant** qu'il tourne,
 * pas seulement être ignoré à la fin : on sonde la ligne, on interrompt un
 * `AbortController`, et ce signal est à la fois passé au travail et posé dans
 * l'ALS de `@/lib/http/jobAbort` — tout appel HTTP du job échoue aussitôt,
 * sans enfiler le signal à travers chaque provider. Les étapes CPU vérifient
 * `throwIfJobAborted()` à leurs frontières.
 */
import { runWithJobAbortSignal } from "@/lib/http/jobAbort";

export type CancellableJobOutcome<T> =
  | { status: "done"; value: T }
  /** La ligne du job a été marquée `cancelled`. */
  | { status: "cancelled" }
  /** Le signal externe (échéance de drain du worker) a interrompu le job. */
  | { status: "aborted" };

export type CancellableJobOptions = {
  isCancelled: (jobId: string) => Promise<boolean>;
  pollMs: number;
  /** Interruption venue du worker lui-même (drain borné). */
  signal?: AbortSignal;
};

export async function runCancellableJob<T>(
  jobId: string,
  work: (signal: AbortSignal) => Promise<T>,
  opts: CancellableJobOptions,
): Promise<CancellableJobOutcome<T>> {
  const controller = new AbortController();
  let cancelled = false;

  const cancelError = () => {
    const error = new Error(`job ${jobId} cancelled`);
    error.name = "AbortError";
    return error;
  };

  const poll = setInterval(() => {
    void opts
      .isCancelled(jobId)
      .then((value) => {
        if (value && !controller.signal.aborted) {
          cancelled = true;
          controller.abort(cancelError());
        }
      })
      .catch(() => {
        /* base injoignable : on resondera au tick suivant */
      });
  }, opts.pollMs);
  if (typeof poll.unref === "function") poll.unref();

  const onOuterAbort = () => {
    if (!controller.signal.aborted) controller.abort(opts.signal?.reason);
  };
  if (opts.signal?.aborted) onOuterAbort();
  else opts.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    const value = await runWithJobAbortSignal(controller.signal, () =>
      work(controller.signal),
    );
    if (cancelled) return { status: "cancelled" };
    return { status: "done", value };
  } catch (error) {
    if (cancelled) return { status: "cancelled" };
    if (controller.signal.aborted) return { status: "aborted" };
    // Une étape sourde au signal peut mourir d'autre chose juste après
    // l'annulation : la ligne fait foi.
    if (await opts.isCancelled(jobId).catch(() => false)) {
      return { status: "cancelled" };
    }
    throw error;
  } finally {
    clearInterval(poll);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}
