import { describe, expect, it } from "vitest";

import {
  candidateDatedContentDirs,
  mergeContentDirLists,
  probeLiveContentDirs,
} from "./cdnEpochProbe";
import { DEFAULT_CONTENT_DIR } from ".";

describe("cdnEpochProbe", () => {
  it("emits YYYYMMDD_1700 candidates covering lookback", () => {
    const dirs = candidateDatedContentDirs(
      new Date("2026-09-16T12:00:00Z"),
      2,
    );
    expect(dirs).toEqual([
      "20260916_1700",
      "20260915_1700",
      "20260914_1700",
    ]);
  });

  it("always keeps primary first when merging", () => {
    expect(
      mergeContentDirLists(
        ["20260915_1700", DEFAULT_CONTENT_DIR],
        ["20260916_1700", "20260915_1700"],
      ),
    ).toEqual([DEFAULT_CONTENT_DIR, "20260915_1700", "20260916_1700"]);
  });

  it("probes only unknown dated dirs and unions hits", async () => {
    const { dirs, probedOk, probedMiss } = await probeLiveContentDirs({
      contentBase:
        "https://cdn.studio-prod.pokemon.com/rainier/Content/Android/1.42.0/",
      knownDirs: [DEFAULT_CONTENT_DIR, "20260820_1700"],
      lookbackDays: 2,
      now: new Date("2026-09-16T12:00:00Z"),
      headStatus: async (url) => {
        if (url.includes("20260915_1700")) return 200;
        if (url.includes("20260916_1700")) return 200;
        return 403;
      },
    });
    expect(probedOk.sort()).toEqual(["20260915_1700", "20260916_1700"]);
    expect(probedMiss).toBe(1); // 20260914
    expect(dirs[0]).toBe(DEFAULT_CONTENT_DIR);
    expect(dirs).toContain("20260820_1700");
    expect(dirs).toContain("20260915_1700");
  });
});
