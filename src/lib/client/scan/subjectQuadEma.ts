/**
 * Exponential moving average on card-quad corners (object-cover or video px).
 * Softens flicker between Sobel / DocAligner frames.
 */

export type QuadPoint = { x: number; y: number };

export type SubjectQuadEma = {
  corners: QuadPoint[] | null;
  alpha: number;
};

export function createSubjectQuadEma(alpha = 0.35): SubjectQuadEma {
  return { corners: null, alpha: Math.min(1, Math.max(0.05, alpha)) };
}

export function resetSubjectQuadEma(state: SubjectQuadEma): void {
  state.corners = null;
}

/**
 * Blend `next` into EMA. Returns the smoothed corners (4 points) or null
 * when `next` is null (miss) — clears state so we don't paint a ghost.
 */
export function pushSubjectQuadEma(
  state: SubjectQuadEma,
  next: QuadPoint[] | null,
): QuadPoint[] | null {
  if (!next || next.length !== 4) {
    state.corners = null;
    return null;
  }
  if (!state.corners || state.corners.length !== 4) {
    state.corners = next.map((p) => ({ x: p.x, y: p.y }));
    return state.corners.map((p) => ({ ...p }));
  }
  const a = state.alpha;
  const out: QuadPoint[] = [];
  for (let i = 0; i < 4; i++) {
    const prev = state.corners[i]!;
    const n = next[i]!;
    const blended = {
      x: prev.x + (n.x - prev.x) * a,
      y: prev.y + (n.y - prev.y) * a,
    };
    state.corners[i] = blended;
    out.push({ ...blended });
  }
  return out;
}
