import { AsyncQueue } from "@/lib/async/asyncQueue";

/**
 * Deux pools d'arrière-plan, parce que `after()` de Next ne détache rien : les
 * jobs partagent l'event loop du serveur. Le point clé, c'est que tout n'a pas
 * le même profil :
 *
 * - Pool I/O (`runBackgroundWork`) : fetch providers et refresh de prix. Le job
 *   passe l'essentiel de son temps à attendre des sockets — on peut donc en
 *   laisser tourner beaucoup sans charger l'event loop, ce qui améliore le débit.
 * - Pool CPU (`runCpuBackgroundWork`) : localisation d'images (redimensionnement
 *   et analyse `sharp`), synchrone et gourmand. Plafond bas : c'est ce travail-là
 *   qui, sans borne, rendait les requêtes interactives injoignables (AxiosError:
 *   Network Error côté navigateur) — la raison d'être du plafond unique à 2.
 *
 * Les deux plafonds sont ajustables : BACKGROUND_IO_CONCURRENCY (à défaut, l'ancien
 * BACKGROUND_WORK_CONCURRENCY est encore respecté) et BACKGROUND_CPU_CONCURRENCY.
 */
const DEFAULT_BACKGROUND_IO_CONCURRENCY = 8;
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

/** Travail d'arrière-plan I/O (fetch providers, refresh de prix). */
export function runBackgroundWork<T>(fn: () => Promise<T>): Promise<T> {
  return ioQueue.run(fn);
}

/** Travail d'arrière-plan CPU (localisation d'images / `sharp`). */
export function runCpuBackgroundWork<T>(fn: () => Promise<T>): Promise<T> {
  return cpuQueue.run(fn);
}
