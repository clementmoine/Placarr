import { describe, expect, it } from "vitest";

import { foilCosTime } from "./webgl/renderer";
import {
  IDLE_LEAN_FACTOR,
  blendLean,
  easeOutCubic,
  idleLeanFromSeconds,
  idlePointerFromSeconds,
} from "./idleLean";

describe("idlePointerFromSeconds", () => {
  it("locks the sweep to foilCosTime.w (Unity Time driver)", () => {
    for (const t of [0, 0.7, Math.PI / 2, Math.PI, 4.2]) {
      const w = foilCosTime(t)[3];
      const pointer = idlePointerFromSeconds(t);
      expect(pointer.x).toBeCloseTo(50 + w * 28);
      expect(pointer.y).toBeCloseTo(50 - w * 22);
    }
  });

  it("keeps glare in the soft idle band", () => {
    const atRest = idlePointerFromSeconds(Math.PI / 2); // cos = 0
    expect(atRest.glare).toBeCloseTo(0.3);
    const atPeak = idlePointerFromSeconds(0); // cos = 1
    expect(atPeak.glare).toBeCloseTo(0.12);
  });

  it("drives --combined in phase with the lean (not |cos|)", () => {
    // Anti-diagonal: x+y barely moves (~94–106). Finishes keyed on --combined
    // need a real sweep — same signed phase as lean, else sheen fights tip.
    const topRight = idlePointerFromSeconds(0); // cos = +1
    expect(topRight.x + topRight.y).toBeCloseTo(106);
    expect(topRight.combined).toBeCloseTo(40);
    const bottomLeft = idlePointerFromSeconds(Math.PI); // cos = -1
    expect(bottomLeft.combined).toBeCloseTo(160);
    const mid = idlePointerFromSeconds(Math.PI / 2); // cos = 0
    expect(mid.combined).toBeCloseTo(100);
  });
});

describe("idleLeanFromSeconds", () => {
  it("is the pointer lean at a soft idle fraction of maxTilt", () => {
    const lean = idleLeanFromSeconds(1.25, 18);
    const { x, y } = idlePointerFromSeconds(1.25);
    expect(lean.lightX).toBeCloseTo(x);
    expect(lean.lightY).toBeCloseTo(y);
    // Interactive ±18°; idle ~±6° so shelves don't rock like a hover.
    expect(lean.tiltY).toBeCloseTo(((x - 50) / 50) * 18 * IDLE_LEAN_FACTOR);
  });
});

describe("blendLean", () => {
  it("eases from the pointer pose toward idle", () => {
    const from = idleLeanFromSeconds(0, 18);
    const to = idleLeanFromSeconds(Math.PI, 18);
    const mid = blendLean(from, to, 0.5);
    const u = easeOutCubic(0.5);
    expect(mid.lightX).toBeCloseTo(from.lightX + (to.lightX - from.lightX) * u);
    expect(blendLean(from, to, 0)).toEqual(from);
    expect(blendLean(from, to, 1).lightX).toBeCloseTo(to.lightX);
  });
});
