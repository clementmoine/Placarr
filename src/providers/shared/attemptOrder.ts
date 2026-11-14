/**
 * Learned attempt order: try the shape that has been answering first.
 *
 * Several packs face the same situation — a card's file exists under exactly
 * one of several URL shapes, and which one is not derivable. dbscards keeps two
 * pools side by side (`/cards/fr/<set>/` and a flat legacy `/cards/original/`)
 * and a set lives entirely in one of them; a Naruto face is `art.webp` or
 * `thumb.jpg` or a reconstruction. Trying them in a fixed order spends one
 * wasted request per card forever, which on a host that can take half a minute
 * to answer is the dominant cost of a pass.
 *
 * So the order is *observed*, not decided: whichever shape answered for this
 * key before is tried first next time. Measured on DBS — the three sets sampled
 * were homogeneous, 8 of 8 cards agreeing with their set — which turns roughly
 * 8400 wasted requests into about 90, one probe per set.
 *
 * Two properties this must keep:
 *
 * A hint, never a filter. If the preferred shape misses, the others are still
 * tried. A card is never lost to a wrong guess — the ledger only reorders.
 *
 * Only answers count. A 200 and a 404 are both information; a timeout is not.
 * A slow host that goes silent for a while would otherwise teach the ledger
 * that its good pool is bad, and the ledger would then send every future
 * request to the wrong place first.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** hits/misses per shape, per key. */
export type AttemptTally = Record<string, Record<string, [number, number]>>;

export type AttemptOrderLedger = {
  tally: AttemptTally;
  dirty: boolean;
};

function ledgerPath(cacheRoot: string, name: string): string {
  return path.join(cacheRoot, "logs", `${name}-attempt-order.json`);
}

export function loadAttemptOrder(
  cacheRoot: string,
  name: string,
): AttemptOrderLedger {
  const file = ledgerPath(cacheRoot, name);
  if (!existsSync(file)) return { tally: {}, dirty: false };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as AttemptTally;
    return { tally: raw && typeof raw === "object" ? raw : {}, dirty: false };
  } catch {
    return { tally: {}, dirty: false };
  }
}

export function saveAttemptOrder(
  cacheRoot: string,
  name: string,
  ledger: AttemptOrderLedger,
): void {
  if (!ledger.dirty) return;
  const file = ledgerPath(cacheRoot, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(ledger.tally, null, 2)}\n`, "utf8");
  ledger.dirty = false;
}

/**
 * Record that a shape answered. `hit` is a 200; `false` is a 404 — a refusal
 * to answer at all must not be reported here.
 */
export function recordAttempt(
  ledger: AttemptOrderLedger,
  key: string,
  shape: string,
  hit: boolean,
): void {
  const forKey = (ledger.tally[key] ??= {});
  const cell = (forKey[shape] ??= [0, 0]);
  if (hit) cell[0] += 1;
  else cell[1] += 1;
  ledger.dirty = true;
}

/**
 * Candidates reordered, most-likely first, preserving the original order among
 * equals so an unobserved key behaves exactly as before.
 */
export function rankAttempts<T>(
  ledger: AttemptOrderLedger,
  key: string,
  candidates: readonly T[],
  shapeOf: (candidate: T) => string,
): T[] {
  const forKey = ledger.tally[key];
  if (!forKey) return [...candidates];
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      const scoreDiff =
        score(forKey, shapeOf(b.candidate)) -
        score(forKey, shapeOf(a.candidate));
      return scoreDiff !== 0 ? scoreDiff : a.index - b.index;
    })
    .map((entry) => entry.candidate);
}

/**
 * Hits minus misses.
 *
 * Deliberately not a ratio: a shape seen once and hit should outrank one never
 * seen, and a ratio makes 1/1 and 50/50 indistinguishable when the second is
 * far better evidence.
 */
function score(
  forKey: Record<string, [number, number]>,
  shape: string,
): number {
  const cell = forKey[shape];
  return cell ? cell[0] - cell[1] : 0;
}
