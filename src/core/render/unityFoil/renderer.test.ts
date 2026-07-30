import { describe, expect, it } from "vitest";

import { unityCosTime } from "./renderer";

describe("unityCosTime", () => {
  it("suit la formule Unity (cos t/8, t/4, t/2, t)", () => {
    const t = Math.PI / 3;
    const [a, b, c, d] = unityCosTime(t);
    expect(a).toBeCloseTo(Math.cos(t / 8));
    expect(b).toBeCloseTo(Math.cos(t / 4));
    expect(c).toBeCloseTo(Math.cos(t / 2));
    expect(d).toBeCloseTo(Math.cos(t));
  });
});
