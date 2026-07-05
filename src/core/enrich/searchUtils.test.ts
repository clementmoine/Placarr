import { describe, expect, it, vi } from "vitest";

import { resolveWithLookupQueries } from "@/core/enrich/searchUtils";

describe("resolveWithLookupQueries", () => {
  it("never forwards legal mark symbols to provider resolvers", async () => {
    const resolver = vi.fn(async () => null);
    await resolveWithLookupQueries(
      ["You Suck at Parking® - Complete Edition"],
      "Fallback™ Title©",
      resolver,
    );

    expect(resolver).toHaveBeenCalledWith(
      "You Suck at Parking - Complete Edition",
    );
    expect(resolver).not.toHaveBeenCalledWith(
      expect.stringMatching(/[\u00AE\u2122\u00A9\u2120\u2117]/),
    );
  });
});
