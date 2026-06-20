import axios from "axios";

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
    return (status >= 500 && status < 600) || status === 429 || status === 430;
  }
  // Erreurs non-HTTP (ex: parsing, réseau bas niveau) → rejouables par défaut.
  return true;
}

export async function retry<T>(
  fn: () => Promise<T>,
  retries = 5,
  delayMs = 300,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 1 || !isRetryableError(err)) throw err;
    console.warn(`Retrying... (${retries - 1} left)`);

    await new Promise((res) => setTimeout(res, delayMs));
    return retry(fn, retries - 1, delayMs * 2); // Backoff exponentiel
  }
}
