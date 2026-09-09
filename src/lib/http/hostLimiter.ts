/**
 * Limiteur sortant par host (intervalle minimum entre requêtes).
 *
 * Un host qui reçoit une rafale finit par répondre 403/429 — dbscards et le
 * CloudFront de Pokémon l'ont tous deux fait payer à une passe parallèle.
 * Chaque requête sortante prend donc un créneau : deux appels vers le même
 * `new URL(url).host` commencent à au moins `minIntervalMs` d'écart. Les hosts
 * différents restent indépendants — le limiteur ne sérialise que ce qui vise
 * la même cible.
 *
 * Mono-processus par construction : Placarr tourne dans un seul conteneur, un
 * état en mémoire est toute l'histoire — pas de Redis, pas de dépendance.
 */

/** Deux profils : l'API tolère la cadence, le scraping non. */
export const HOST_LIMITER_PROFILES = {
  /**
   * Appels API rapides. La dédup en vol et le cache TTL font déjà le gros du
   * travail ; ici on ne casse que les rafales les plus dures.
   */
  api: 120,
  /** Scraping : la cadence qu'un WAF laisse passer sans dresser le sourcil. */
  scrape: 1_000,
} as const;

export type HostLimiterProfile = keyof typeof HOST_LIMITER_PROFILES;

export type HostSlotOptions = {
  profile?: HostLimiterProfile;
  /** Surcharge par appel. `0` court-circuite le limiteur (tests, urgences). */
  minIntervalMs?: number;
  signal?: AbortSignal;
};

type HostState = {
  /** Timestamp du prochain créneau disponible. */
  nextAt: number;
  /** Chaîne de sérialisation des créneaux de ce host. */
  tail: Promise<void>;
};

const hosts = new Map<string, HostState>();

/** Borne la map : un worker long ne doit pas la faire gonfler sans limite. */
const MAX_TRACKED_HOSTS = 500;

export function hostKeyOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Sleep annulable : un job qui meurt ne doit pas rester assis sur son créneau. */
function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Host limiter wait aborted", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/** Évince les hosts au repos quand la map est pleine. */
function evictIdleHosts(now: number): void {
  for (const [host, state] of hosts) {
    if (hosts.size <= MAX_TRACKED_HOSTS) break;
    if (state.nextAt <= now) hosts.delete(host);
  }
}

/**
 * Attend le prochain créneau de ce host. Les créneaux se chaînent par host :
 * chaque appel repart de la fin d'attente du précédent, donc la cadence tient
 * quelle que soit la concurrence. Un appel annulé libère son créneau sans
 * casser la chaîne des suivants.
 */
export async function waitForHostSlot(
  url: string,
  options: HostSlotOptions = {},
): Promise<void> {
  const minIntervalMs =
    options.minIntervalMs ?? HOST_LIMITER_PROFILES[options.profile ?? "api"];
  if (minIntervalMs <= 0) return;

  const host = hostKeyOf(url);
  const existing = hosts.get(host);
  const state: HostState = existing ?? { nextAt: 0, tail: Promise.resolve() };
  if (!existing) {
    if (hosts.size >= MAX_TRACKED_HOSTS) evictIdleHosts(Date.now());
    hosts.set(host, state);
  }

  // Le préfixe synchrone garantit que l'appel suivant voit cette queue à jour.
  const current = state.tail.then(async () => {
    const wait = state.nextAt - Date.now();
    if (wait > 0) await abortableDelay(wait, options.signal);
    // Créneau pris maintenant : le prochain s'ouvre dans `minIntervalMs`.
    state.nextAt = Date.now() + minIntervalMs;
  });
  state.tail = current.then(noop, noop);
  await current;
}

const noop = () => {};

export function resetHostLimiterForTests(): void {
  hosts.clear();
}
