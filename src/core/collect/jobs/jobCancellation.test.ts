import { afterEach, describe, expect, it, vi } from "vitest";

import { getJobAbortSignal } from "@/lib/http/jobAbort";

import { runCancellableJob } from "./jobCancellation";

afterEach(() => {
  vi.useRealTimers();
});

/** Resolves when the job ALS signal aborts — stands for a long Sync step. */
function untilJobAborted(): Promise<never> {
  return new Promise((_, reject) => {
    const signal = getJobAbortSignal();
    if (!signal) {
      reject(new Error("no job abort signal in scope"));
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

describe("runCancellableJob", () => {
  it("aborts the running work once the job row is marked cancelled", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const isCancelled = vi.fn(async () => cancelled);
    const seen: AbortSignal[] = [];

    const run = runCancellableJob(
      "job-1",
      async (signal) => {
        seen.push(signal);
        await untilJobAborted();
      },
      { isCancelled, pollMs: 1_000 },
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(seen[0]?.aborted).toBe(false);
    cancelled = true;
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(run).resolves.toEqual({ status: "cancelled" });
    expect(seen[0]?.aborted).toBe(true);
  });

  it("exposes the same signal to HTTP through the job ALS", async () => {
    let inScope: AbortSignal | undefined;
    const out = await runCancellableJob(
      "job-2",
      async (signal) => {
        inScope = getJobAbortSignal();
        expect(inScope).toBe(signal);
        return 42;
      },
      { isCancelled: async () => false, pollMs: 1_000 },
    );
    expect(out).toEqual({ status: "done", value: 42 });
    expect(getJobAbortSignal()).toBeUndefined();
  });

  it("rethrows a real failure of a job nobody cancelled", async () => {
    await expect(
      runCancellableJob(
        "job-3",
        async () => {
          throw new Error("scrape broke");
        },
        { isCancelled: async () => false, pollMs: 1_000 },
      ),
    ).rejects.toThrow("scrape broke");
  });

  it("treats a failure after cancellation as the cancellation", async () => {
    // A step that ignores the signal but dies on the aborted HTTP call.
    const out = await runCancellableJob(
      "job-4",
      async () => {
        throw new Error("socket hang up");
      },
      { isCancelled: async () => true, pollMs: 1_000 },
    );
    expect(out).toEqual({ status: "cancelled" });
  });

  it("aborts from an outer signal too (worker drain deadline)", async () => {
    const outer = new AbortController();
    const run = runCancellableJob(
      "job-5",
      async () => {
        await untilJobAborted();
      },
      { isCancelled: async () => false, pollMs: 60_000, signal: outer.signal },
    );
    outer.abort(new Error("drain deadline"));
    await expect(run).resolves.toEqual({ status: "aborted" });
  });
});
