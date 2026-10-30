import { describe, expect, it } from "vitest";

import {
  nextBackoffMs,
  shouldIgnoreWatchPath,
  shouldResetFailureStreak,
} from "./superviseDevWorkerLogic";

describe("superviseDevWorkerLogic", () => {
  it("backs off exponentially then caps", () => {
    expect(nextBackoffMs(0, 1000, 30_000)).toBe(1000);
    expect(nextBackoffMs(1, 1000, 30_000)).toBe(2000);
    expect(nextBackoffMs(2, 1000, 30_000)).toBe(4000);
    expect(nextBackoffMs(10, 1000, 30_000)).toBe(30_000);
  });

  it("resets the failure streak only after a healthy run", () => {
    expect(shouldResetFailureStreak(59_999, 60_000)).toBe(false);
    expect(shouldResetFailureStreak(60_000, 60_000)).toBe(true);
  });

  it("ignores non-TS and excluded watch paths", () => {
    expect(shouldIgnoreWatchPath("src/core/collect/jobs/workQueue.ts")).toBe(
      false,
    );
    expect(shouldIgnoreWatchPath("scripts/backgroundWorker.ts")).toBe(false);
    expect(shouldIgnoreWatchPath("src/readme.md")).toBe(true);
    expect(shouldIgnoreWatchPath("/app/data/pokemon/x.ts")).toBe(true);
    expect(shouldIgnoreWatchPath("/app/node_modules/tsx/cli.ts")).toBe(true);
    expect(shouldIgnoreWatchPath("/app/.next/server/chunk.ts")).toBe(true);
    expect(
      shouldIgnoreWatchPath("src\\providers\\foo\\data\\cache.ts"),
    ).toBe(true);
  });
});
