import { describe, expect, it } from "vitest";

import { computeCapabilityRisk } from "./providerCoverage";

describe("computeCapabilityRisk", () => {
  it("marks capabilities with no declared providers as n/a", () => {
    expect(computeCapabilityRisk([], [])).toBe("n/a");
  });

  it("marks zero configured providers as missing when providers exist", () => {
    expect(computeCapabilityRisk(["tmdb", "omdb"], [])).toBe("missing");
  });

  it("marks a lone configured provider as single-source", () => {
    expect(computeCapabilityRisk(["howlongtobeat"], ["howlongtobeat"])).toBe(
      "single-source",
    );
  });

  it("marks single-source when multiple providers exist but only one is configured", () => {
    expect(computeCapabilityRisk(["tmdb", "omdb"], ["tmdb"])).toBe(
      "single-source",
    );
  });

  it("marks ok when multiple configured providers exist", () => {
    expect(computeCapabilityRisk(["tmdb", "omdb"], ["tmdb", "omdb"])).toBe(
      "ok",
    );
  });
});
