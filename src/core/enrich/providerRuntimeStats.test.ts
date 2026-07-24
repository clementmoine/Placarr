import { describe, expect, it, beforeEach } from "vitest";

import {
  getProviderRuntimeStat,
  orderProviderIdsForResolve,
  PROVIDER_STATS_COLD_START_SAMPLES,
  providerResolvePriorityScore,
  recordProviderContribution,
  recordProviderResolve,
  resetProviderRuntimeStatsForTests,
} from "@/core/enrich/providerRuntimeStats";

describe("providerRuntimeStats", () => {
  beforeEach(() => {
    resetProviderRuntimeStatsForTests();
  });

  it("tracks EMA latency and hit rate", () => {
    recordProviderResolve({
      providerId: "fast-mock",
      mediaType: "books",
      durationMs: 100,
      hit: true,
    });
    recordProviderResolve({
      providerId: "fast-mock",
      mediaType: "books",
      durationMs: 300,
      hit: false,
    });

    const stat = getProviderRuntimeStat("fast-mock", "books");
    expect(stat?.resolveCount).toBe(2);
    expect(stat?.hitCount).toBe(1);
    expect(stat?.latencyEmaMs).toBeGreaterThan(100);
    expect(stat?.latencyEmaMs).toBeLessThan(300);
  });

  it("orders slow rarely-used providers after fast useful ones once warmed", () => {
    for (let i = 0; i < PROVIDER_STATS_COLD_START_SAMPLES; i++) {
      recordProviderResolve({
        providerId: "fast-useful",
        durationMs: 200,
        hit: true,
      });
      recordProviderContribution({
        providerId: "fast-useful",
        kind: "cover",
      });
      recordProviderResolve({
        providerId: "slow-useless",
        durationMs: 18_000,
        hit: false,
      });
    }

    expect(
      providerResolvePriorityScore("fast-useful"),
    ).toBeGreaterThan(providerResolvePriorityScore("slow-useless"));

    expect(
      orderProviderIdsForResolve(["slow-useless", "fast-useful", "other"]),
    ).toEqual(["fast-useful", "other", "slow-useless"]);
  });

  it("keeps pinned ids first regardless of score", () => {
    for (let i = 0; i < PROVIDER_STATS_COLD_START_SAMPLES; i++) {
      recordProviderResolve({
        providerId: "fast-useful",
        durationMs: 100,
        hit: true,
      });
      recordProviderResolve({
        providerId: "pinned-slow",
        durationMs: 20_000,
        hit: false,
      });
    }

    expect(
      orderProviderIdsForResolve(["fast-useful", "pinned-slow"], {
        pinnedIds: ["pinned-slow"],
      }),
    ).toEqual(["pinned-slow", "fast-useful"]);
  });

  it("never drops providers from the ordered list", () => {
    const ids = ["a", "b", "c", "d"];
    expect(orderProviderIdsForResolve(ids).sort()).toEqual([...ids].sort());
  });
});
