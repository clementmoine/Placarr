import { describe, expect, it } from "vitest";

const { PROVIDERS } = await import("@/services/provider/registry");

import { providerHealthChecks } from "@/services/provider/runtime";

describe("providerHealthChecks", () => {
  it("contains unique provider ids", () => {
    const ids = providerHealthChecks.map((check) => check.providerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("maps checks to declared providers", () => {
    for (const check of providerHealthChecks) {
      const provider = PROVIDERS.find(
        (candidate) => candidate.id === check.providerId,
      );
      expect(provider).toBeDefined();
    }
  });
});
