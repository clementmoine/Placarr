/**
 * Multi-subject focus: rank by detector score (already centre-biased), then
 * honour an explicit tap promote without a second identify.
 */

export type FocusableSubject = {
  /** Stable-ish key from the AABB centre (video px). */
  key: string;
  score: number;
  coverage: number;
  aabb: { left: number; top: number; width: number; height: number };
  cornersNorm: ReadonlyArray<{ x: number; y: number }>;
};

export function subjectKeyFromAabb(aabb: {
  left: number;
  top: number;
  width: number;
  height: number;
}): string {
  const cx = Math.round(aabb.left + aabb.width / 2);
  const cy = Math.round(aabb.top + aabb.height / 2);
  // Coarse grid so EMA jitter doesn't churn the focus key.
  return `${Math.round(cx / 24)}_${Math.round(cy / 24)}`;
}

/**
 * Primary first: promoted focus key if still visible, else highest score
 * (classical already folds centre proximity into score).
 */
export function orderSubjectsByFocus<T extends FocusableSubject>(
  subjects: readonly T[],
  focusKey: string | null,
): T[] {
  if (!subjects.length) return [];
  const ranked = [...subjects].sort((a, b) => b.score - a.score);
  if (!focusKey) return ranked;
  const idx = ranked.findIndex((s) => s.key === focusKey);
  if (idx <= 0) return ranked;
  const next = [...ranked];
  const [picked] = next.splice(idx, 1);
  if (!picked) return ranked;
  return [picked, ...next];
}

/** Hit-test a normalised overlay point against subject quads (primary last so secondaries win ties). */
export function pickSubjectAtNorm<T extends FocusableSubject>(
  subjects: readonly T[],
  nx: number,
  ny: number,
): T | null {
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  // Prefer later (lower-rank) hits so a tap on a secondary doesn't stick to primary.
  let hit: T | null = null;
  for (const s of subjects) {
    if (pointInQuadNorm(nx, ny, s.cornersNorm)) hit = s;
  }
  return hit;
}

function pointInQuadNorm(
  nx: number,
  ny: number,
  corners: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  if (corners.length !== 4) return false;
  // Ray cast in normalised space.
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const ci = corners[i]!;
    const cj = corners[j]!;
    const intersect =
      ci.y > ny !== cj.y > ny &&
      nx < ((cj.x - ci.x) * (ny - ci.y)) / (cj.y - ci.y + 1e-9) + ci.x;
    if (intersect) inside = !inside;
  }
  return inside;
}
