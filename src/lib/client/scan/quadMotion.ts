/**
 * Motion for the subject frame: the drawn rectangle glides to each new
 * detection instead of teleporting.
 *
 * Pure maths, no DOM — the component owns the rAF loop. Corners are matched
 * to the previous frame by cyclic order so a card near 45° does not make the
 * outline spin, and every coordinate follows a critically-damped spring.
 */

export type MotionPoint = { x: number; y: number };
export type MotionQuad = [MotionPoint, MotionPoint, MotionPoint, MotionPoint];

export type QuadSpringState = {
  /** Current drawn position (8 scalars, x0 y0 x1 y1 …). */
  position: Float64Array;
  velocity: Float64Array;
  /** Last target, already aligned to the drawn order. */
  target: Float64Array;
  settled: boolean;
};

export type SpringOptions = {
  /** Natural frequency driver — higher snaps faster (default 170). */
  stiffness?: number;
  /** Damping ratio ≥ 1 = no overshoot (default 1 → critical). */
  dampingRatio?: number;
  /** Below this positional delta + velocity the spring is settled (px). */
  restThreshold?: number;
};

const DEFAULT_STIFFNESS = 170;
const DEFAULT_DAMPING_RATIO = 1;
const DEFAULT_REST = 0.15;

function flatten(q: MotionQuad): Float64Array {
  const out = new Float64Array(8);
  for (let i = 0; i < 4; i++) {
    out[i * 2] = q[i]!.x;
    out[i * 2 + 1] = q[i]!.y;
  }
  return out;
}

export function unflatten(v: Float64Array | number[]): MotionQuad {
  return [
    { x: v[0]!, y: v[1]! },
    { x: v[2]!, y: v[3]! },
    { x: v[4]!, y: v[5]! },
    { x: v[6]!, y: v[7]! },
  ];
}

/**
 * Re-order `next` by the cyclic shift that stays closest to `prev` (same
 * winding). A detector that relabels TL/TR as the card passes 45° would
 * otherwise send every corner a quarter turn away.
 */
export function alignQuadOrder(prev: MotionQuad, next: MotionQuad): MotionQuad {
  let best = next;
  let bestCost = Infinity;
  for (let shift = 0; shift < 4; shift++) {
    let cost = 0;
    for (let i = 0; i < 4; i++) {
      const p = prev[i]!;
      const n = next[(i + shift) % 4]!;
      cost += Math.hypot(n.x - p.x, n.y - p.y);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = [
        next[shift % 4]!,
        next[(shift + 1) % 4]!,
        next[(shift + 2) % 4]!,
        next[(shift + 3) % 4]!,
      ];
    }
  }
  return best;
}

/** Spring state resting exactly on `quad`. */
export function createQuadSpring(quad: MotionQuad): QuadSpringState {
  const position = flatten(quad);
  return {
    position,
    velocity: new Float64Array(8),
    target: Float64Array.from(position),
    settled: true,
  };
}

/** Point a spring at a new quad (aligned to the drawn order). */
export function retargetQuadSpring(
  state: QuadSpringState,
  quad: MotionQuad,
): void {
  const aligned = alignQuadOrder(unflatten(state.position), quad);
  state.target = flatten(aligned);
  state.settled = false;
}

/**
 * Advance the spring by `dtMs`. Semi-implicit Euler in fixed sub-steps so a
 * long frame (GC pause, tab switch) cannot explode the integration.
 */
export function stepQuadSpring(
  state: QuadSpringState,
  dtMs: number,
  opts: SpringOptions = {},
): MotionQuad {
  if (state.settled) return unflatten(state.position);
  const k = opts.stiffness ?? DEFAULT_STIFFNESS;
  const zeta = opts.dampingRatio ?? DEFAULT_DAMPING_RATIO;
  const c = 2 * zeta * Math.sqrt(k);
  const rest = opts.restThreshold ?? DEFAULT_REST;

  const total = Math.min(0.25, Math.max(0, dtMs) / 1000);
  const steps = Math.max(1, Math.ceil(total / (1 / 240)));
  const h = total / steps;
  const { position, velocity, target } = state;
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < 8; i++) {
      const x = position[i]!;
      const v = velocity[i]!;
      const a = -k * (x - target[i]!) - c * v;
      const nv = v + a * h;
      velocity[i] = nv;
      position[i] = x + nv * h;
    }
  }

  let maxDelta = 0;
  for (let i = 0; i < 8; i++) {
    maxDelta = Math.max(
      maxDelta,
      Math.abs(position[i]! - target[i]!),
      Math.abs(velocity[i]!) / 60,
    );
  }
  if (maxDelta < rest) {
    position.set(target);
    velocity.fill(0);
    state.settled = true;
  }
  return unflatten(position);
}

/** Quad scaled about its centroid — used for the appear/disappear settle. */
export function scaleQuadAboutCentre(
  q: MotionQuad,
  factor: number,
): MotionQuad {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  return q.map((p) => ({
    x: cx + (p.x - cx) * factor,
    y: cy + (p.y - cy) * factor,
  })) as MotionQuad;
}

/**
 * SVG path of a convex quad with rounded corners. Each corner is cut at
 * `radius` along both edges (clamped to 45 % of the shorter one) and bridged
 * with a quadratic curve through the vertex — the circular-looking rounding
 * of a UI rectangle, valid for any tilt or mild perspective.
 */
export function roundedQuadPath(q: MotionQuad, radius: number): string {
  if (radius <= 0) {
    return `M${q.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join("L")}Z`;
  }
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    const prev = q[(i + 3) % 4]!;
    const cur = q[i]!;
    const next = q[(i + 1) % 4]!;
    const lenIn = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const lenOut = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, 0.45 * Math.min(lenIn, lenOut));
    const inPt =
      lenIn > 0
        ? {
            x: cur.x - ((cur.x - prev.x) / lenIn) * r,
            y: cur.y - ((cur.y - prev.y) / lenIn) * r,
          }
        : cur;
    const outPt =
      lenOut > 0
        ? {
            x: cur.x + ((next.x - cur.x) / lenOut) * r,
            y: cur.y + ((next.y - cur.y) / lenOut) * r,
          }
        : cur;
    parts.push(
      `${i === 0 ? "M" : "L"}${fmt(inPt.x)},${fmt(inPt.y)}`,
      `Q${fmt(cur.x)},${fmt(cur.y)} ${fmt(outPt.x)},${fmt(outPt.y)}`,
    );
  }
  parts.push("Z");
  return parts.join("");
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : "0";
}
