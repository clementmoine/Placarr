/**
 * Single usable-subject gate for overlay paint + identify crop.
 *
 * Bounds are derived from catalogue card geometry and the embed model's
 * input size — not free-floating coverage floats. Judged on the quad's own
 * sides when known so tilt / landscape cards stay valid.
 */

import { CARD_EMBED_PREPROCESS } from "@/core/identify/embedMath";
import {
  CARD_ASPECT_MAX,
  CARD_ASPECT_MIN,
  CARD_ASPECT_PERSPECTIVE_SLACK,
  CARD_PRINT_ASPECT,
  CARD_PRINT_SIDES,
} from "@/lib/shared/vision/cardGeometry";

export {
  CARD_ASPECT_MAX,
  CARD_ASPECT_MIN,
  CARD_ASPECT_PERSPECTIVE_SLACK,
  CARD_PRINT_ASPECT,
  CARD_PRINT_SIDES,
};

/**
 * Short side in video pixels must clear the embed shortest-edge enough for
 * the art band to still feed DINOv2 after downscale (½ of shortest_edge).
 */
export const MIN_SUBJECT_SHORT_PX = Math.ceil(
  CARD_EMBED_PREPROCESS.shortestEdge / 2,
);

/** Long side floor — same ratio as the print, from the short floor. */
export const MIN_SUBJECT_LONG_PX = Math.ceil(
  MIN_SUBJECT_SHORT_PX * CARD_PRINT_ASPECT,
);

/**
 * Long-edge of the classical detect buffer — twice the embed shortest edge
 * so a min-size card still resolves as a blob after downscale (~480 on the
 * current 256 shortest_edge).
 */
export const DETECT_LONG_EDGE_PX = CARD_EMBED_PREPROCESS.shortestEdge * 2;

/**
 * Desk coverage floor from a min-size card on a reference 1080p frame;
 * ceiling leaves table around the subject (same family as classical span).
 */
const REF_FRAME_AREA = 1920 * 1080;
const minCoverageFromEmbed =
  (MIN_SUBJECT_SHORT_PX * MIN_SUBJECT_LONG_PX) / REF_FRAME_AREA;

export const USABLE_SUBJECT = {
  minCoverage: Math.max(0.04, minCoverageFromEmbed),
  /** Leave frame around the subject (table / fingers). */
  maxCoverage: 0.86,
  minSideRatio: CARD_ASPECT_MIN,
  maxSideRatio: CARD_ASPECT_MAX,
  minShortSide: MIN_SUBJECT_SHORT_PX,
  minLongSide: MIN_SUBJECT_LONG_PX,
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
