import { AsyncQueue } from "@/lib/async/asyncQueue";

/**
 * File GLOBALE des travaux d'arrière-plan (enrichissements metadata, refresh
 * de prix). `after()` de Next ne détache rien : les jobs partagent l'event
 * loop du serveur — sans plafond, N refreshs simultanés (sharp, parsing HTML,
 * fan-out providers) rendent les requêtes interactives injoignables
 * (AxiosError: Network Error côté navigateur).
 *
 * Concurrence par défaut : 2 (un job qui avance + un job qui attend ses I/O),
 * ajustable via BACKGROUND_WORK_CONCURRENCY.
 */
const DEFAULT_BACKGROUND_WORK_CONCURRENCY = 2;

function resolveConcurrency(): number {
  const raw = Number.parseInt(
    process.env.BACKGROUND_WORK_CONCURRENCY || "",
    10,
  );
  return Number.isFinite(raw) && raw > 0
    ? raw
    : DEFAULT_BACKGROUND_WORK_CONCURRENCY;
}

const backgroundWorkQueue = new AsyncQueue(resolveConcurrency());

/** Exécute un travail d'arrière-plan sous le plafond global de concurrence. */
export function runBackgroundWork<T>(fn: () => Promise<T>): Promise<T> {
  return backgroundWorkQueue.run(fn);
}
