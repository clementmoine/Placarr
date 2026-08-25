/**
 * Circuit breaker soft-ban, persisté entre les runs.
 *
 * A host that answers 403/429/503 is not saying "no such file", it is saying
 * "stop". Two packs learned that the expensive way — the Pokémon CDN scrape
 * under parallel load, then the DBS faces pass — so the state lives here
 * rather than in either of them.
 *
 * États : closed → open (échec rapide) → half-open (la requête suivante est
 * la sonde) → closed. Le reset est exponentiel à ouvertures consécutives
 * (2 → 5 → 15 → 60 min, plafonné — voir `circuitBreaker`) : un host qui
 * repousse la sonde reste fermé plus longtemps à chaque fois. La machine à
 * états est la même que le breaker en mémoire de `lib/http/circuitBreaker` ;
 * ici elle survit au process.
 *
 * Persisted on purpose: an in-memory flag only protects the run that got
 * banned. The next run starts innocent, hammers the same host, and extends the
 * block. On disk, the cooldown outlives the process.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  circuitCooldownMs,
  type CircuitState,
} from "@/lib/http/circuitBreaker";

/** Statuses that mean "slow down", never "not found". */
export const SOFTBAN_STATUSES = new Set([403, 429, 503]);

export function isSoftbanStatus(status: number | undefined): boolean {
  return status != null && SOFTBAN_STATUSES.has(status);
}

export type SoftbanState = {
  until: string;
  reason: string;
  writtenAt: string;
  /**
   * Ouvertures consécutives du breaker — pilote le palier de reset.
   * Absent dans les fichiers écrits avant le circuit breaker (lus comme 0).
   */
  openings?: number;
};

function logsDir(cacheRoot: string): string {
  return path.join(cacheRoot, "logs");
}

export function softbanStatePath(cacheRoot: string, name = "cdn"): string {
  return path.join(logsDir(cacheRoot), `${name}-softban-until.json`);
}

export function readSoftbanState(
  cacheRoot: string,
  name?: string,
): SoftbanState | null {
  const file = softbanStatePath(cacheRoot, name);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as SoftbanState;
    if (!raw?.until) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeSoftbanState(
  cacheRoot: string,
  opts: { until: Date; reason: string; name?: string; openings?: number },
): SoftbanState {
  mkdirSync(logsDir(cacheRoot), { recursive: true });
  const state: SoftbanState = {
    until: opts.until.toISOString(),
    reason: opts.reason,
    writtenAt: new Date().toISOString(),
  };
  if (opts.openings != null) state.openings = opts.openings;
  writeFileSync(
    softbanStatePath(cacheRoot, opts.name),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );
  return state;
}

export function clearSoftbanState(cacheRoot: string, name?: string): void {
  const file = softbanStatePath(cacheRoot, name);
  if (existsSync(file)) unlinkSync(file);
}

/** Cooldown still to run, in ms — `0` when clear. */
export function softbanRemainingMs(
  cacheRoot: string,
  now = Date.now(),
  name?: string,
): number {
  const state = readSoftbanState(cacheRoot, name);
  if (!state) return 0;
  const until = Date.parse(state.until);
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - now);
}

/**
 * État du circuit : "open" tant que le cooldown court, "half-open" quand le
 * fichier est là mais expiré — la requête suivante est la sonde —, "closed"
 * sinon.
 */
export function softbanCircuitState(
  cacheRoot: string,
  name?: string,
  now = Date.now(),
): CircuitState {
  const state = readSoftbanState(cacheRoot, name);
  if (!state) return "closed";
  const until = Date.parse(state.until);
  if (!Number.isFinite(until)) return "closed";
  return until > now ? "open" : "half-open";
}

/**
 * true si la requête peut partir : circuit fermé, ou half-open — l'appel est
 * alors la sonde. Un circuit ouvert échoue vite, sans toucher au réseau.
 */
export function softbanAllows(
  cacheRoot: string,
  name?: string,
  now = Date.now(),
): boolean {
  return softbanCircuitState(cacheRoot, name, now) !== "open";
}

/**
 * Échec : ouverture (ou réouverture) du circuit, persistée. Les ouvertures
 * consécutives montent d'un palier de reset — un succès entre-temps
 * (`clearSoftbanState`) aurait effacé le fichier. L'ancien format sans
 * `openings` est lu comme 0 : la première ouverture enregistrée prend le
 * premier palier.
 */
export function recordSoftbanFailure(
  cacheRoot: string,
  opts: {
    reason: string;
    name?: string;
    now?: number;
    /** Paliers de reset — défaut : 2 → 5 → 15 → 60 min. */
    scheduleMs?: readonly number[];
  },
): SoftbanState {
  const now = opts.now ?? Date.now();
  const previous = readSoftbanState(cacheRoot, opts.name);
  const openings = (previous?.openings ?? 0) + 1;
  const cooldownMs = circuitCooldownMs(openings, opts.scheduleMs);
  return writeSoftbanState(cacheRoot, {
    until: new Date(now + cooldownMs),
    reason: opts.reason,
    name: opts.name,
    openings,
  });
}
