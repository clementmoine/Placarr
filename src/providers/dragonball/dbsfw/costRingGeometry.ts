/**
 * Cost_01 atlas geometry derived from decoded RGBA (or dump dims).
 * Replaces hard-coded centre / outer diameter when a Cost_01 buffer is present.
 */

export type CostRingGeometry = {
  /**
   * Fill / hole centre — where `CostFrame_*` is blitted and where Frost anchors.
   * Inner chrome rim (dark well), not the opaque bbox (soft alpha pulls that down).
   */
  center: { x: number; y: number };
  /**
   * Opaque silver+pip bbox centre — isolate radius is measured from here.
   */
  outerCenter: { x: number; y: number };
  /** Atlas edge (Cost_01.m_Width). */
  atlasSize: number;
  /** Opaque silver+pip bbox diameter. */
  outerDiam: number;
  /**
   * Frost cost-disc slot edge (typically 32), not `CostFrame_*.m_Width`.
   * On-card scale = frostDiam / fillSize.
   */
  fillSize: number;
};

/**
 * Fallback measured on StandaloneOSX Cost_01 when no buffer yet.
 * Prefer {@link deriveCostRingGeometry} + dump dims at extract time.
 */
export const DEFAULT_COST_RING_GEOMETRY: CostRingGeometry = {
  center: { x: 178.7, y: 79.8 },
  outerCenter: { x: 178.5, y: 81.5 },
  atlasSize: 220,
  outerDiam: 44,
  fillSize: 32,
};

/**
 * Walk rays from `origin` and collect dark→bright transitions (inner chrome rim).
 * Returns the mean of those points, or null when too few samples.
 */
function innerRimCenter(
  rgba: Buffer,
  width: number,
  height: number,
  origin: { x: number; y: number },
): { x: number; y: number } | null {
  const points: { x: number; y: number }[] = [];
  for (let deg = 0; deg < 360; deg += 2) {
    const rad = (deg * Math.PI) / 180;
    let sawDark = false;
    for (let r = 0; r < 30; r += 0.5) {
      const x = Math.round(origin.x + r * Math.cos(rad));
      const y = Math.round(origin.y + r * Math.sin(rad));
      if (x < 0 || y < 0 || x >= width || y >= height) break;
      const i = (y * width + x) * 4;
      const a = rgba[i + 3] ?? 0;
      const L =
        ((rgba[i] ?? 0) + (rgba[i + 1] ?? 0) + (rgba[i + 2] ?? 0)) / 3;
      const dark = a > 20 && L < 50;
      const bright = a > 80 && L >= 70;
      if (sawDark && bright) {
        points.push({ x, y });
        break;
      }
      if (dark || (a > 20 && L < 70)) sawDark = true;
    }
  }
  if (points.length < 24) return null;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/**
 * Largest circle that fits in the dark well around `seed` before hitting
 * bright chrome. Y-band means alone drift toward the Cost_02/03 waist;
 * `innerRimCenter` is wrong here (figure-8 chrome skews the rim mean).
 */
function refineHoleCenter(
  rgba: Buffer,
  width: number,
  height: number,
  seed: { x: number; y: number },
  search = 5,
): { x: number; y: number } {
  let best = seed;
  let bestR = -1;
  for (let dy = -search; dy <= search; dy += 0.25) {
    for (let dx = -search; dx <= search; dx += 0.25) {
      const cx = seed.x + dx;
      const cy = seed.y + dy;
      let minR = 40;
      for (let deg = 0; deg < 360; deg += 5) {
        const rad = (deg * Math.PI) / 180;
        for (let r = 1; r < 40; r += 0.5) {
          const x = Math.round(cx + r * Math.cos(rad));
          const y = Math.round(cy + r * Math.sin(rad));
          if (x < 0 || y < 0 || x >= width || y >= height) {
            minR = Math.min(minR, r);
            break;
          }
          const i = (y * width + x) * 4;
          const a = rgba[i + 3] ?? 0;
          const L =
            ((rgba[i] ?? 0) + (rgba[i + 1] ?? 0) + (rgba[i + 2] ?? 0)) / 3;
          if (a > 80 && L >= 70) {
            minR = Math.min(minR, r);
            break;
          }
        }
      }
      if (minR > bestR) {
        bestR = minR;
        best = { x: cx, y: cy };
      }
    }
  }
  return best;
}

/**
 * Dark-well centres for `Cost_0N` (N holes stacked in the atlas cell).
 * Splits opaque dark pixels into `holeCount` Y-bands, then refines each
 * seed onto the well’s inner rim (Cost_02 waist otherwise pulls the mean).
 */
export function deriveCostRingHoleCenters(
  rgba: Buffer,
  width: number,
  height: number,
  holeCount: number,
  alphaThreshold = 60,
  lumaThreshold = 80,
): { x: number; y: number }[] {
  const n = Math.max(1, Math.min(3, Math.round(holeCount)));
  const points: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3] ?? 0;
      if (a < alphaThreshold) continue;
      const L =
        ((rgba[i] ?? 0) + (rgba[i + 1] ?? 0) + (rgba[i + 2] ?? 0)) / 3;
      if (L >= lumaThreshold) continue;
      points.push({ x, y });
    }
  }
  if (points.length === 0) return [];
  const seeds: { x: number; y: number }[] = [];
  if (n === 1) {
    let sx = 0;
    let sy = 0;
    for (const p of points) {
      sx += p.x;
      sy += p.y;
    }
    seeds.push({ x: sx / points.length, y: sy / points.length });
  } else {
    const ys = points.map((p) => p.y).sort((a, b) => a - b);
    for (let band = 0; band < n; band += 1) {
      const lo = ys[Math.floor((band * ys.length) / n)]!;
      const hi = ys[
        Math.min(ys.length - 1, Math.floor(((band + 1) * ys.length) / n) - 1)
      ]!;
      let sx = 0;
      let sy = 0;
      let count = 0;
      for (const p of points) {
        if (p.y < lo || p.y > hi) continue;
        sx += p.x;
        sy += p.y;
        count += 1;
      }
      if (count === 0) continue;
      seeds.push({ x: sx / count, y: sy / count });
    }
  }
  return seeds.map((seed) => refineHoleCenter(rgba, width, height, seed));
}

/**
 * Opaque bbox → outerDiam + outerCentre; fill centre from inner chrome rim
 * (falls back to outer centre when the rim cannot be sampled).
 */
export function deriveCostRingGeometry(
  rgba: Buffer,
  width: number,
  height: number,
  fillSize = DEFAULT_COST_RING_GEOMETRY.fillSize,
  alphaThreshold = 32,
): CostRingGeometry {
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let n = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = rgba[(y * width + x) * 4 + 3] ?? 0;
      if (a < alphaThreshold) continue;
      n += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (n === 0) {
    return {
      ...DEFAULT_COST_RING_GEOMETRY,
      atlasSize: width,
      fillSize,
    };
  }
  const outerDiam = Math.max(maxX - minX + 1, maxY - minY + 1);
  const outerCenter = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  };
  const rim = innerRimCenter(rgba, width, height, outerCenter);
  return {
    center: rim ?? outerCenter,
    outerCenter,
    atlasSize: width,
    outerDiam,
    fillSize,
  };
}
