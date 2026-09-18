import { describe, expect, it } from "vitest";

import { listKayouLenticularPlayroomSamples } from "./playroomSamples";

describe("kayou playroom lenticular samples", () => {
  it("ships one face per lenticular family when the catalogue is installed", () => {
    const samples = listKayouLenticularPlayroomSamples();
    expect(samples.map((row) => row.variant)).toEqual([
      "hr-2x2",
      "hr-3x2",
      "hr-3x1",
      "hr-2x1",
      "bp",
      "mr",
      "holo",
    ]);
    for (const sample of samples) {
      expect(sample.imageUrl).toMatch(/^\/assets\/naruto\/kayou\//);
      expect(sample.foilMaskUrl).toContain("full_foil_mask.webp");
    }
    const byVariant = Object.fromEntries(samples.map((s) => [s.variant, s]));
    expect(byVariant["hr-2x2"]?.name).toBe("Sasuke & Naruto");
    expect(byVariant["hr-3x2"]?.printKey).toBe(
      "kayou:smritiheavenscrolls1-nrss.hr.005",
    );
    expect(byVariant["hr-3x1"]?.name).toBe("Ichiraku Ramen");
    expect(byVariant["hr-2x1"]?.name).toBe("Boruto Uzumaki");
  });
});
