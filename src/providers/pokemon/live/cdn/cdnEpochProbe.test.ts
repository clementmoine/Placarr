import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  candidateDatedContentDirs,
  mergeContentDirLists,
  probeLiveContentDirs,
  resolveLiveContentDirs,
} from "./cdnEpochProbe";
import { DEFAULT_CONTENT_DIR } from ".";

describe("cdnEpochProbe", () => {
  it("emits YYYYMMDD_1700 candidates covering lookback", () => {
    const dirs = candidateDatedContentDirs(new Date("2026-09-16T12:00:00Z"), 2);
    expect(dirs).toEqual(["20260916_1700", "20260915_1700", "20260914_1700"]);
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

describe("resolveLiveContentDirs — durable dated buckets", () => {
  // 2026-11-23 : me5-5 vit sous 20260915_1700 (69 j), me6 sous 20261105_1700 ;
  // la Sync ne sondait que 10101_0000 et la fenêtre de 60 j perdait me5-5.
  const now = new Date("2026-11-23T12:00:00Z");
  const base = "https://cdn.example/rainier/Content/Android/1.44.0/";
  const live = new Set(["20260915_1700", "20261105_1700"]);
  const head = async (url: string) =>
    [...live].some((d) => url.includes(`/${d}/`)) ? 200 : 403;

  it("cold start looks back a year and remembers what it found", async () => {
    const cacheRoot = mkdtempSync(path.join(tmpdir(), "live-dirs-"));
    const first = await resolveLiveContentDirs({
      contentBase: base,
      cacheRoot,
      now,
      headStatus: head,
    });
    expect(first).toEqual([
      DEFAULT_CONTENT_DIR,
      "20261105_1700",
      "20260915_1700",
    ]);

    // Next Sync: a short window no longer reaches 2026-09-15, the durable
    // list still does.
    const probed: string[] = [];
    const second = await resolveLiveContentDirs({
      contentBase: base,
      cacheRoot,
      now: new Date("2027-01-10T12:00:00Z"),
      headStatus: async (url) => {
        probed.push(url);
        return 403;
      },
    });
    expect(second).toEqual(
      expect.arrayContaining(["20260915_1700", "20261105_1700"]),
    );
    expect(probed.length).toBeLessThanOrEqual(61);
  });
});
