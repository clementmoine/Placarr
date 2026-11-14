import { describe, expect, it } from "vitest";

import {
  createSubjectQuadEma,
  pushSubjectQuadEma,
  resetSubjectQuadEma,
} from "@/lib/client/scan/subjectQuadEma";

const quad = (
  x: number,
): Array<{ x: number; y: number }> => [
  { x, y: 0 },
  { x: x + 1, y: 0 },
  { x: x + 1, y: 1 },
  { x, y: 1 },
];

describe("subjectQuadEma", () => {
  it("adopts the first sample as-is", () => {
    const state = createSubjectQuadEma(0.5);
    const out = pushSubjectQuadEma(state, quad(0));
    expect(out?.[0]?.x).toBe(0);
  });

  it("blends subsequent corners toward the new sample", () => {
    const state = createSubjectQuadEma(0.5);
    pushSubjectQuadEma(state, quad(0));
    const out = pushSubjectQuadEma(state, quad(10));
    expect(out?.[0]?.x).toBe(5);
  });

  it("clears on miss so we do not paint a ghost", () => {
    const state = createSubjectQuadEma();
    pushSubjectQuadEma(state, quad(0));
    expect(pushSubjectQuadEma(state, null)).toBeNull();
    resetSubjectQuadEma(state);
    expect(state.corners).toBeNull();
  });
});
