import { describe, expect, it } from "vitest";

import {
  POINTER_SPRING_OMEGA,
  springLean,
  springSettled,
  springStep,
} from "./pointerSpring";

describe("springStep", () => {
  it("moves toward the target without overshooting on a single step", () => {
    const next = springStep(0, 100, 16, POINTER_SPRING_OMEGA);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(100);
  });

  it("reaches the target after enough time", () => {
    let x = 0;
    for (let i = 0; i < 120; i++) x = springStep(x, 50, 16);
    expect(x).toBeCloseTo(50, 1);
  });
});

describe("springLean", () => {
  it("interpolates every Lean axis", () => {
    const from = { tiltX: 0, tiltY: 0, lightX: 50, lightY: 50 };
    const to = { tiltX: 10, tiltY: -8, lightX: 80, lightY: 20 };
    const mid = springLean(from, to, 16);
    expect(mid.tiltX).toBeGreaterThan(0);
    expect(mid.tiltX).toBeLessThan(10);
    expect(mid.lightX).toBeGreaterThan(50);
  });
});

describe("springSettled", () => {
  it("is true when current matches target", () => {
    const lean = { tiltX: 1, tiltY: 2, lightX: 40, lightY: 60 };
    expect(springSettled(lean, lean, 0.5, 0.5)).toBe(true);
  });

  it("is false while still approaching", () => {
    const a = { tiltX: 0, tiltY: 0, lightX: 50, lightY: 50 };
    const b = { tiltX: 10, tiltY: 0, lightX: 50, lightY: 50 };
    expect(springSettled(a, b, 0.2, 0.66)).toBe(false);
  });
});
