import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    providerAffinity: {
      upsert: (...args: unknown[]) => upsert(...args),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/core/catalog/catalog", () => ({
  providerIdForSourceToken: (source: string) => {
    if (source === "pkmcards") return "pkmmarket";
    if (source === "opecards") return "opemarket";
    return source.toLowerCase().replace(/[^a-z0-9]+/g, "") || source;
  },
}));

import {
  affinityScopePackFromPrintKey,
  affinityScopeType,
  orderByAffinity,
  recordPriceAffinityFromOffers,
} from "./providerAffinity";

describe("providerAffinity scopes", () => {
  it("builds type and pack scopes without item ids", () => {
    expect(affinityScopeType("TCG")).toBe("type:tcg");
    expect(affinityScopePackFromPrintKey("lorcana:9-1")).toBe("pack:lorcana");
    expect(affinityScopePackFromPrintKey("")).toBeNull();
  });
});

describe("orderByAffinity", () => {
  it("moves affine providers first while keeping relative order of the rest", () => {
    const modules = [
      { id: "a" },
      { id: "b" },
      { id: "c" },
      { id: "d" },
    ];
    const ordered = orderByAffinity(
      modules,
      (m) => m.id,
      [
        {
          providerId: "c",
          successCount: 3,
          confidence: 0.8,
          lastAt: new Date(),
        },
        {
          providerId: "a",
          successCount: 1,
          confidence: 0.5,
          lastAt: new Date(),
        },
      ],
    );
    expect(ordered.map((m) => m.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("never drops non-affine providers (consensus stays multi-source)", () => {
    const modules = [{ id: "proven" }, { id: "other" }, { id: "third" }];
    const ordered = orderByAffinity(
      modules,
      (m) => m.id,
      [
        {
          providerId: "proven",
          successCount: 10,
          confidence: 0.9,
          lastAt: new Date(),
        },
      ],
    );
    expect(ordered.map((m) => m.id).sort()).toEqual(
      ["other", "proven", "third"].sort(),
    );
    expect(ordered).toHaveLength(modules.length);
  });
});

describe("recordPriceAffinityFromOffers", () => {
  beforeEach(() => {
    upsert.mockReset();
    upsert.mockResolvedValue({});
  });

  it("stores canonical module ids from offer source tokens", async () => {
    await recordPriceAffinityFromOffers({
      shelfType: "tcg",
      printKey: "pokemon:me5-001",
      providerIds: ["pkmcards", "cardnexus"],
    });

    const providerIds = upsert.mock.calls.map(
      (call) =>
        (call[0] as { create: { providerId: string } }).create.providerId,
    );
    expect(providerIds).toEqual(
      expect.arrayContaining(["pkmmarket", "cardnexus"]),
    );
    expect(providerIds).not.toContain("pkmcards");
  });
});
