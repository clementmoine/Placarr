import { describe, expect, it } from "vitest";

import { assessLumaStats } from "./cardFrameGate";

function fill(value: number, n = 64 * 64): Uint8Array {
  return Uint8Array.from({ length: n }, () => value);
}

describe("assessLumaStats", () => {
  it("rejects solid black (lens cover / dark table)", () => {
    const hit = assessLumaStats(fill(8));
    expect(hit.usable).toBe(false);
    expect(hit.reason).toBe("too_dark");
  });

  it("rejects near-uniform grey", () => {
    const hit = assessLumaStats(fill(120));
    expect(hit.usable).toBe(false);
    expect(hit.reason).toBe("too_flat");
  });

  it("accepts a high-contrast card-like patch", () => {
    const gray = fill(40);
    for (let i = 0; i < gray.length; i += 2) gray[i] = 220;
    for (let i = 0; i < 500; i++) gray[i] = 10 + (i % 40);
    const hit = assessLumaStats(gray);
    expect(hit.usable).toBe(true);
    expect(hit.variance).toBeGreaterThan(180);
  });
});
