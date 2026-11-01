/**
 * Single usable-subject gate for overlay paint + identify crop.
 *
 * A card window that dominates enough of the frame without swallowing the
 * whole desk. Judged on the quad's own sides when they are known: the
 * bounding box of a card lying on its side is landscape, and the one of a
 * portrait card tilted 45° is square, yet both are the card the user aims at
 * — the rectifier turns either back into an upright face.
 */

export const USABLE_SUBJECT = {
  minCoverage: 0.08,
  maxCoverage: 0.78,
  /** Long side over short side: a TCG face is 88/63 ≈ 1.4, never square. */
  minSideRatio: 1.02,
  /** …and never a band (two cards welded, a desk edge, a sleeve strip). */
  maxSideRatio: 2.2,
  minShortSide: 48,
  minLongSide: 64,
} as const;

export type SubjectPoint = { x: number; y: number };

export type SubjectMetrics = {
  coverage: number;
  aabb: { width: number; height: number };
  /**
   * Quad corners (TL→TR→BR→BL, video px) when the detector produced them —
   * measured instead of the bounding box so tilt and orientation drop out.
   */
  corners?: readonly SubjectPoint[] | null;
};

function sideLen(a: SubjectPoint, b: SubjectPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Mean side lengths of a 4-corner quad, or null if it is not one. */
function quadSides(
  corners: readonly SubjectPoint[] | null | undefined,
): { a: number; b: number } | null {
  if (!corners || corners.length !== 4) return null;
  const [tl, tr, br, bl] = corners as [
    SubjectPoint,
    SubjectPoint,
    SubjectPoint,
    SubjectPoint,
  ];
  for (const p of [tl, tr, br, bl]) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return null;
  }
  return {
    a: (sideLen(tl, tr) + sideLen(bl, br)) / 2,
    b: (sideLen(tl, bl) + sideLen(tr, br)) / 2,
  };
}

export function isUsableSubject(m: SubjectMetrics | null | undefined): boolean {
  if (!m) return false;
  if (
    m.coverage < USABLE_SUBJECT.minCoverage ||
    m.coverage > USABLE_SUBJECT.maxCoverage
  ) {
    return false;
  }
  const sides = quadSides(m.corners);
  const a = sides ? sides.a : m.aabb.width;
  const b = sides ? sides.b : m.aabb.height;
  const shortSide = Math.min(a, b);
  const longSide = Math.max(a, b);
  if (shortSide < USABLE_SUBJECT.minShortSide) return false;
  if (longSide < USABLE_SUBJECT.minLongSide) return false;
  const ratio = longSide / Math.max(1, shortSide);
  if (ratio < USABLE_SUBJECT.minSideRatio) return false;
  if (ratio > USABLE_SUBJECT.maxSideRatio) return false;
  return true;
}
