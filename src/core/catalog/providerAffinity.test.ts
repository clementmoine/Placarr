import { describe, expect, it } from "vitest";

import {
  AFFINITY_EXPLORATION_TTL_MS,
  affinityScopePackFromPrintKey,
  affinityScopeType,
  applyAffinityExploration,
  orderByAffinity,
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
});

describe("applyAffinityExploration", () => {
  const affinities = [
    {
      providerId: "c",
      successCount: 3,
      confidence: 0.8,
      lastAt: new Date("2026-11-05T12:00:00Z"),
    },
  ];

  it("keeps only affine providers while successes are fresh", () => {
    const ordered = [{ id: "c" }, { id: "a" }, { id: "b" }];
    expect(
      applyAffinityExploration(ordered, (m) => m.id, affinities, {
        now: new Date("2026-11-06T12:00:00Z"),
      }).map((m) => m.id),
    ).toEqual(["c"]);
  });

  it("re-opens exploration after TTL", () => {
    const ordered = [{ id: "c" }, { id: "a" }, { id: "b" }];
    const later = new Date(
      affinities[0]!.lastAt.getTime() + AFFINITY_EXPLORATION_TTL_MS + 1,
    );
    expect(
      applyAffinityExploration(ordered, (m) => m.id, affinities, {
        now: later,
      }).map((m) => m.id),
    ).toEqual(["c", "a", "b"]);
  });
});
