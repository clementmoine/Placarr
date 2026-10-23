/**
 * ChallengeSolver — résolution de challenges anti-bot derrière une interface.
 *
 * Un site protégé (Cloudflare « just a moment »…) ne se fetch pas, il se
 * *résout* : un navigateur externe passe le challenge et rend le HTML ou les
 * cookies de session. L'implémentation du jour est FlareSolverr ; un
 * remplaçant API-compatible (Byparr…) ne touche que le câblage ci-dessous,
 * pas les appelants — `scrapeFetch` ne connaît que cette interface.
 */
import {
  flareSolverrCookiesFor,
  flareSolverrRequestGet,
} from "@/lib/http/flareSolverr";

export type ChallengeFetchOptions = {
  maxTimeoutMs?: number;
  signal?: AbortSignal;
};

/** Cookies + User-Agent de la session une fois le challenge résolu. */
export type ChallengeCookies = {
  cookie: string;
  userAgent: string;
};

export interface ChallengeSolver {
  /** HTML de la page après résolution, `null` si le challenge a échoué. */
  fetchHtml(
    url: string,
    options?: ChallengeFetchOptions,
  ): Promise<string | null>;
  /** Cookies de session après résolution, `null` si le challenge a échoué. */
  fetchCookies(
    referer: string,
    options?: ChallengeFetchOptions,
  ): Promise<ChallengeCookies | null>;
}

/**
 * Implémentation par défaut : FlareSolverr. Les appels sont délégués à
 * l'invocation (pas au chargement du module) pour que les tests qui mockent
 * `@/lib/http/flareSolverr` interceptent aussi ce solver.
 */
export const flareSolverrChallengeSolver: ChallengeSolver = {
  fetchHtml: (url, options) =>
    flareSolverrRequestGet(url, {
      maxTimeoutMs: options?.maxTimeoutMs,
      signal: options?.signal,
    }),
  fetchCookies: (referer, options) =>
    flareSolverrCookiesFor(referer, options?.maxTimeoutMs, options?.signal),
};

let activeChallengeSolver: ChallengeSolver = flareSolverrChallengeSolver;

export function getChallengeSolver(): ChallengeSolver {
  return activeChallengeSolver;
}

/**
 * Remplace le solver actif — câblage au démarrage, ou stub en test.
 * `null` restaure l'implémentation par défaut.
 */
export function setChallengeSolver(solver: ChallengeSolver | null): void {
  activeChallengeSolver = solver ?? flareSolverrChallengeSolver;
}
