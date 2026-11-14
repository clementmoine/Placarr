import { describe, expect, it } from "vitest";

import {
  getJobAbortSignal,
  resolveRequestAbortSignal,
  runWithJobAbortSignal,
  throwIfJobAborted,
} from "./jobAbort";

describe("jobAbort ALS", () => {
  it("exposes the active signal inside runWithJobAbortSignal", async () => {
    const controller = new AbortController();
    await runWithJobAbortSignal(controller.signal, async () => {
      expect(getJobAbortSignal()).toBe(controller.signal);
      expect(resolveRequestAbortSignal()).toBe(controller.signal);
    });
    expect(getJobAbortSignal()).toBeUndefined();
  });

  it("throwIfJobAborted raises AbortError when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await runWithJobAbortSignal(controller.signal, async () => {
      expect(() => throwIfJobAborted()).toThrow(
        expect.objectContaining({ name: "AbortError" }),
      );
    });
  });

  it("prefers an explicit signal over the ALS", async () => {
    const job = new AbortController();
    const explicit = new AbortController();
    await runWithJobAbortSignal(job.signal, async () => {
      expect(resolveRequestAbortSignal(explicit.signal)).toBe(explicit.signal);
    });
  });
});
