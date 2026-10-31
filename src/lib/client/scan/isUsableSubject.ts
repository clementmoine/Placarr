/**
 * Single usable-subject gate for overlay paint + identify crop.
 *
 * Portrait card window that dominates enough of the frame without
 * swallowing the whole desk.
 */

export const USABLE_SUBJECT = {
  minCoverage: 0.08,
  maxCoverage: 0.78,
  /** AABB height must exceed width × this (portrait TCG). */
  minPortraitAspect: 1.02,
  minAabbWidth: 48,
  minAabbHeight: 64,
} as const;

export type SubjectMetrics = {
  coverage: number;
  aabb: { width: number; height: number };
};

export function isUsableSubject(m: SubjectMetrics | null | undefined): boolean {
  if (!m) return false;
  if (
    m.coverage < USABLE_SUBJECT.minCoverage ||
    m.coverage > USABLE_SUBJECT.maxCoverage
  ) {
    return false;
  }
  const { width, height } = m.aabb;
  if (width < USABLE_SUBJECT.minAabbWidth) return false;
  if (height < USABLE_SUBJECT.minAabbHeight) return false;
  if (height <= width * USABLE_SUBJECT.minPortraitAspect) return false;
  return true;
}
