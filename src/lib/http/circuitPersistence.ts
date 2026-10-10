/**
 * Persistence disque pour le circuit breaker HTTP (`circuitBreaker.ts`).
 *
 * Même format que `providers/shared/softban` (until / reason / openings) :
 * un redémarrage de worker ne repart plus « innocent » face à un host qui
 * venait de nous bannir (autonomy_audit §1 / ADR-008 — désormais réellement
 * branché sur `scrapeFetch`).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type CircuitPersistedState = {
  until: string;
  reason: string;
  writtenAt: string;
  openings?: number;
};

/** `undefined` = lazy default (`data/http/circuits`), `null` = off (tests). */
let persistenceRoot: string | null | undefined = undefined;

export function setCircuitPersistenceRoot(root: string | null): void {
  persistenceRoot = root;
}

export function circuitPersistenceRoot(): string | null {
  if (persistenceRoot === null) return null;
  if (typeof persistenceRoot === "string") return persistenceRoot;
  // Vitest : pas d'écriture sous data/ sauf si un test pose un root explicite.
  if (process.env.VITEST) return null;
  try {
    // Lazy import : évite un cycle runtimeData ↔ http au chargement des tests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- sync, one-shot
    const { dataRoot } = require("@/lib/runtimeData") as {
      dataRoot: () => string;
    };
    return path.join(dataRoot(), "http", "circuits");
  } catch {
    return null;
  }
}

/** Host / clé → nom de fichier sûr (pas de slash). */
export function circuitPersistenceFileName(key: string): string {
  const safe = String(key || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return `${safe || "unknown"}.json`;
}

export function circuitPersistencePath(key: string): string | null {
  const root = circuitPersistenceRoot();
  if (!root) return null;
  return path.join(root, circuitPersistenceFileName(key));
}

export function readCircuitPersistedState(
  key: string,
): CircuitPersistedState | null {
  const file = circuitPersistencePath(key);
  if (!file || !existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as CircuitPersistedState;
    if (!raw?.until) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeCircuitPersistedState(
  key: string,
  opts: { until: Date; reason: string; openings: number },
): CircuitPersistedState | null {
  const file = circuitPersistencePath(key);
  if (!file) return null;
  mkdirSync(path.dirname(file), { recursive: true });
  const state: CircuitPersistedState = {
    until: opts.until.toISOString(),
    reason: opts.reason,
    writtenAt: new Date().toISOString(),
    openings: opts.openings,
  };
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}

export function clearCircuitPersistedState(key: string): void {
  const file = circuitPersistencePath(key);
  if (file && existsSync(file)) unlinkSync(file);
}
