import { describe, expect, it } from "vitest";

import { PROVIDERS } from "@/services/providerRegistry";

import { providerHealthChecks } from "./healthChecks";

describe("providerHealthChecks", () => {
  it("contains unique provider ids", () => {
    const ids = providerHealthChecks.map((check) => check.providerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("maps checks to declared providers", () => {
    for (const check of providerHealthChecks) {
      const provider = PROVIDERS.find((candidate) => candidate.id === check.providerId);
      expect(provider).toBeDefined();
    }
  });
});
