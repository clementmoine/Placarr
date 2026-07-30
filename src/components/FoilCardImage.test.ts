import { describe, expect, it } from "vitest";

import { tiltFromLightPercent } from "@/components/FoilCardImage";

describe("tiltFromLightPercent", () => {
  it("reste à 0 au centre", () => {
    expect(tiltFromLightPercent(50, 0.4)).toBe(0);
  });

  it("atteint ±timeFactor aux bords (balayage mono-axe = amplitude idle)", () => {
    expect(tiltFromLightPercent(0, 0.4)).toBeCloseTo(-0.4);
    expect(tiltFromLightPercent(100, 0.4)).toBeCloseTo(0.4);
    expect(tiltFromLightPercent(0, 0.33)).toBeCloseTo(-0.33);
  });
});
