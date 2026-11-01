import { describe, expect, it } from "vitest";

import {
  alignQuadOrder,
  createQuadSpring,
  retargetQuadSpring,
  roundedQuadPath,
  scaleQuadAboutCentre,
  stepQuadSpring,
  type MotionQuad,
} from "./quadMotion";

const rect = (x: number, y: number, w: number, h: number): MotionQuad => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

function simulate(
  state: ReturnType<typeof createQuadSpring>,
  ms: number,
  frameMs = 16.7,
): MotionQuad {
  let last: MotionQuad = rect(0, 0, 0, 0);
  for (let t = 0; t < ms; t += frameMs) last = stepQuadSpring(state, frameMs);
  return last;
}

describe("alignQuadOrder", () => {
  it("undoes a quarter-turn relabel of the same quad", () => {
    const prev = rect(10, 10, 60, 90);
    const rotatedLabels: MotionQuad = [prev[1], prev[2], prev[3], prev[0]];
    expect(alignQuadOrder(prev, rotatedLabels)).toEqual(prev);
  });

  it("leaves an already aligned quad alone", () => {
    const prev = rect(10, 10, 60, 90);
    const next = rect(12, 9, 61, 91);
    expect(alignQuadOrder(prev, next)).toEqual(next);
  });
});

describe("stepQuadSpring", () => {
  it("glides to the target without overshoot and settles", () => {
    const state = createQuadSpring(rect(0, 0, 100, 150));
    retargetQuadSpring(state, rect(50, 40, 100, 150));
    const mid = stepQuadSpring(state, 50);
    expect(mid[0].x).toBeGreaterThan(0);
    expect(mid[0].x).toBeLessThan(50);
    expect(state.settled).toBe(false);
    const end = simulate(state, 1500);
    expect(end[0].x).toBeCloseTo(50, 5);
    expect(end[2].y).toBeCloseTo(190, 5);
    expect(state.settled).toBe(true);
  });

  it("never overshoots with critical damping", () => {
    const state = createQuadSpring(rect(0, 0, 100, 150));
    retargetQuadSpring(state, rect(80, 0, 100, 150));
    for (let i = 0; i < 120; i++) {
      const q = stepQuadSpring(state, 16.7);
      expect(q[0].x).toBeLessThanOrEqual(80 + 1e-6);
    }
  });

  it("survives a long frame (tab switch) without exploding", () => {
    const state = createQuadSpring(rect(0, 0, 100, 150));
    retargetQuadSpring(state, rect(300, 200, 100, 150));
    const q = stepQuadSpring(state, 5000);
    expect(Number.isFinite(q[0].x)).toBe(true);
    expect(q[0].x).toBeGreaterThanOrEqual(0);
    expect(q[0].x).toBeLessThanOrEqual(300 + 1e-6);
  });

  it("follows a retarget mid-flight from its current position", () => {
    const state = createQuadSpring(rect(0, 0, 100, 150));
    retargetQuadSpring(state, rect(100, 0, 100, 150));
    simulate(state, 60);
    const before = state.position[0]!;
    retargetQuadSpring(state, rect(0, 0, 100, 150));
    const q = stepQuadSpring(state, 16.7);
    // Continues smoothly: no jump back to 0, momentum carries it on a bit
    // before the spring turns it around.
    expect(q[0].x).toBeGreaterThan(before);
    expect(q[0].x - before).toBeLessThan(10);
  });
});

describe("roundedQuadPath", () => {
  it("emits four rounded corners with clamped radius", () => {
    const d = roundedQuadPath(rect(0, 0, 100, 150), 12);
    expect(d.match(/Q/g)?.length).toBe(4);
    expect(d.startsWith("M0.00,12.00")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    // Radius larger than the short edge is clamped (45 % of 20 = 9).
    const tiny = roundedQuadPath(rect(0, 0, 20, 150), 50);
    expect(tiny.startsWith("M0.00,9.00")).toBe(true);
  });

  it("degrades to a plain polygon at radius 0", () => {
    expect(roundedQuadPath(rect(0, 0, 10, 10), 0)).toBe(
      "M0.00,0.00L10.00,0.00L10.00,10.00L0.00,10.00Z",
    );
  });
});

describe("scaleQuadAboutCentre", () => {
  it("keeps the centroid", () => {
    const q = scaleQuadAboutCentre(rect(10, 10, 100, 100), 1.1);
    expect((q[0].x + q[2].x) / 2).toBeCloseTo(60);
    expect(q[0].x).toBeCloseTo(5);
  });
});
