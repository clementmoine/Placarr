import axios from "axios";

import { isAbortError, throwIfAborted } from "@/lib/http/abort";

/** Sleeps `delayMs`, but rejects immediately if `signal` aborts meanwhile. */
function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Retry aborted", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Détermine si une erreur vaut la peine d'être réessayée.
 * On réessaie sur les erreurs réseau/timeout et les 5xx (transitoires),
 * mais jamais sur les 4xx (erreurs définitives : 400/401/403/404…).
 */
export function isRetryableError(err: unknown): boolean {
  if (axios.isAxiosError(err)) {
    // Pas de réponse = problème réseau / timeout → rejouable.
    if (!err.response) return true;
    const status = err.response.status;
    // 429/430 are provider quota signals (ScreenScraper) — retrying hammers the API.
    return status >= 500 && status < 600;
  }
  // Erreurs non-HTTP (ex: parsing, réseau bas niveau) → rejouables par défaut.
  return true;
}

/**
 * `retries` is the total number of attempts, not extra ones. Three is the
 * default because every attempt holds a background worker slot through its own
 * backoff — past that, a flaky provider costs more than it returns.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 300,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  try {
    return await fn();
  } catch (err) {
    // A cancelled request (session abort) must never be retried: axios surfaces
    // it as ERR_CANCELED, which has no response and would otherwise look like a
    // retryable network error — turning one abort into five.
    if (isAbortError(err)) throw err;
    if (retries <= 1 || !isRetryableError(err)) throw err;
    console.warn(`Retrying... (${retries - 1} left)`);

    await abortableDelay(delayMs, signal);
    return retry(fn, retries - 1, delayMs * 2, signal); // Backoff exponentiel
  }
}
