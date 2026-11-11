import axios from "axios";

import { isAbortError, throwIfAborted } from "@/lib/http/abort";

/**
 * Plafond d'attente entre deux tentatives. Au-delà, un provider en difficulté
 * immobilise un slot de worker pour un gain nul — et un `Retry-After`
 * déraisonnable est traité comme un signal de quota, pas comme une consigne.
 */
const MAX_BACKOFF_MS = 60_000;

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
 * Délai demandé par le serveur via `Retry-After` (secondes ou date HTTP),
 * plafonné à MAX_BACKOFF_MS. `null` si absent ou illisible. L'en-tête prime
 * sur tout backoff calculé : c'est la consigne du serveur, pas une suggestion.
 */
export function retryAfterMs(err: unknown): number | null {
  if (!axios.isAxiosError(err)) return null;
  const raw = err.response?.headers?.["retry-after"];
  if (raw == null) return null;
  const value = Array.isArray(raw) ? raw[0] : String(raw);
  const seconds = Number(value);
  let ms: number;
  if (Number.isFinite(seconds)) {
    ms = seconds * 1000;
  } else {
    const at = Date.parse(value);
    if (Number.isNaN(at)) return null;
    ms = at - Date.now();
  }
  if (!(ms > 0)) return null;
  return Math.min(ms, MAX_BACKOFF_MS);
}

/** Bulk harvests (TCGdex CDN…) can retry hundreds of times — throttle the warn. */
const RETRY_WARN_WINDOW_MS = 15_000;
const retryWarnState = {
  lastAt: 0,
  suppressed: 0,
};

/** Test hook — resets the throttled retry warn counter. */
export function resetRetryWarnStateForTests(): void {
  retryWarnState.lastAt = 0;
  retryWarnState.suppressed = 0;
}

function formatRetryDetail(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status) return `HTTP ${status}`;
    if (err.code) return err.code;
    return err.message || "axios";
  }
  if (err instanceof Error && err.message) return err.message;
  return "error";
}

function warnRetry(retriesLeft: number, err: unknown): void {
  const now = Date.now();
  if (now - retryWarnState.lastAt < RETRY_WARN_WINDOW_MS) {
    retryWarnState.suppressed += 1;
    return;
  }
  const detail = formatRetryDetail(err);
  const extra =
    retryWarnState.suppressed > 0
      ? ` (+${retryWarnState.suppressed} similar since last warn)`
      : "";
  retryWarnState.suppressed = 0;
  retryWarnState.lastAt = now;
  console.warn(`Retrying... (${retriesLeft} left): ${detail}${extra}`);
}

/**
 * `retries` is the total number of attempts, not extra ones. Three is the
 * default because every attempt holds a background worker slot through its own
 * backoff — past that, a flaky provider costs more than it returns.
 *
 * Backoff exponentiel avec full jitter (`random(0, base * 2^attempt)`, cf. AWS
 * Architecture Blog) : sans jitter, des workers synchronisés retombent sur le
 * provider en même temps et recréent le pic qui a causé l'échec.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 300,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      // A cancelled request (session abort) must never be retried: axios surfaces
      // it as ERR_CANCELED, which has no response and would otherwise look like a
      // retryable network error — turning one abort into five.
      if (isAbortError(err)) throw err;
      if (attempt >= retries || !isRetryableError(err)) throw err;
      warnRetry(retries - attempt, err);

      const cap = Math.min(delayMs * 2 ** (attempt - 1), MAX_BACKOFF_MS);
      const jittered = Math.random() * cap;
      const floor = retryAfterMs(err);
      await abortableDelay(
        floor != null ? Math.max(jittered, floor) : jittered,
        signal,
      );
    }
  }
}
