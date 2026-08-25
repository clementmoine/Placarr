/**
 * Circuit breaker en mémoire, par clé (host, provider…).
 *
 * États : closed → open (échec rapide, plus aucun appel ne part) → half-open
 * (une sonde, une seule à la fois) → closed. Le reset est exponentiel à
 * ouvertures consécutives : 2 → 5 → 15 → 60 minutes, plafonné — un host qui
 * nous repousse une fois mérite une courte pause, un host qui repousse la
 * sonde mérite une longue.
 *
 * `softban.ts` (providers/shared) persiste la même machine à états sur disque
 * pour les passes CLI ; ce module couvre le chemin chaud en mémoire —
 * `scrapeFetch` notamment, où un host ouvert court-circuite l'appel direct.
 */

export type CircuitState = "closed" | "open" | "half-open";

/** Paliers de reset à ouvertures consécutives, en ms. Le dernier fait plafond. */
export const CIRCUIT_RESET_SCHEDULE_MS: readonly number[] = [2, 5, 15, 60].map(
  (minutes) => minutes * 60_000,
);

/**
 * Cooldown de la `openings`-ième ouverture consécutive (1-indexé). Au-delà du
 * dernier palier, on reste au plafond.
 */
export function circuitCooldownMs(
  openings: number,
  schedule: readonly number[] = CIRCUIT_RESET_SCHEDULE_MS,
): number {
  const tier = Math.min(Math.max(openings, 1), schedule.length) - 1;
  return schedule[tier]!;
}

type Entry = {
  /** Ouvertures consécutives — pilote le palier de reset. */
  openings: number;
  /** Timestamp de fin de cooldown. */
  until: number;
  /** Début de la sonde half-open en vol, s'il y en a une. */
  probeStartedAt: number | null;
};

const entries = new Map<string, Entry>();

/** Borne la map : une clé par host, mais autant ne pas la laisser gonfler. */
const MAX_TRACKED_KEYS = 500;

/**
 * Une sonde qui n'a jamais rendu son verdict (process mort, abort non signalé)
 * ne doit pas fermer le half-open pour toujours : passé ce délai, une nouvelle
 * sonde est admise.
 */
const PROBE_STALE_MS = 2 * 60_000;

export function circuitStateOf(key: string, now = Date.now()): CircuitState {
  const entry = entries.get(key);
  if (!entry) return "closed";
  return entry.until > now ? "open" : "half-open";
}

/** Temps de cooldown restant, en ms — `0` quand le circuit laisse passer. */
export function circuitRetryAfterMs(key: string, now = Date.now()): number {
  const entry = entries.get(key);
  if (!entry) return 0;
  return Math.max(0, entry.until - now);
}

/**
 * true si l'appel peut partir. En half-open, une seule sonde à la fois : la
 * première demande la prend, les suivantes échouent vite — c'est la sonde qui
 * décidera, pas une rafale.
 */
export function circuitAllowsRequest(key: string, now = Date.now()): boolean {
  const entry = entries.get(key);
  if (!entry) return true;
  if (entry.until > now) return false;
  if (
    entry.probeStartedAt != null &&
    now - entry.probeStartedAt < PROBE_STALE_MS
  ) {
    return false;
  }
  entry.probeStartedAt = now;
  return true;
}

/** Succès : le circuit se referme et oublie tout. */
export function recordCircuitSuccess(key: string): void {
  entries.delete(key);
}

/**
 * Échec : ouverture (ou réouverture) du circuit. Les ouvertures consécutives
 * montent d'un palier de reset ; un succès entre-temps aurait effacé l'entrée.
 */
export function recordCircuitFailure(
  key: string,
  now = Date.now(),
): { openings: number; until: number } {
  const previous = entries.get(key);
  const openings = (previous?.openings ?? 0) + 1;
  const until = now + circuitCooldownMs(openings);
  if (!previous && entries.size >= MAX_TRACKED_KEYS) {
    const oldest = entries.keys().next();
    if (!oldest.done) entries.delete(oldest.value);
  }
  entries.set(key, { openings, until, probeStartedAt: null });
  return { openings, until };
}

export function resetCircuitBreakersForTests(): void {
  entries.clear();
}
