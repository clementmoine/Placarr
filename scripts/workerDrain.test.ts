import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_WORKER_DRAIN_TIMEOUT_MS,
  resolveWorkerDrainTimeoutMs,
  startWorkerDrain,
} from "./workerDrain";

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveWorkerDrainTimeoutMs", () => {
  it("defaults to a bounded delay and honours WORKER_DRAIN_TIMEOUT_MS", () => {
    expect(resolveWorkerDrainTimeoutMs({})).toBe(
      DEFAULT_WORKER_DRAIN_TIMEOUT_MS,
    );
    expect(DEFAULT_WORKER_DRAIN_TIMEOUT_MS).toBeGreaterThan(0);
    expect(
      resolveWorkerDrainTimeoutMs({ WORKER_DRAIN_TIMEOUT_MS: "90000" }),
    ).toBe(90_000);
    // Never unbounded: junk / zero falls back to the default.
    expect(resolveWorkerDrainTimeoutMs({ WORKER_DRAIN_TIMEOUT_MS: "0" })).toBe(
      DEFAULT_WORKER_DRAIN_TIMEOUT_MS,
    );
    expect(
      resolveWorkerDrainTimeoutMs({ WORKER_DRAIN_TIMEOUT_MS: "abc" }),
    ).toBe(DEFAULT_WORKER_DRAIN_TIMEOUT_MS);
  });
});

describe("startWorkerDrain", () => {
  it("interrupts in-flight jobs once the deadline passes, with a log", async () => {
    // 2026-11-22 : un drain attendait la fin d'une Sync de plusieurs heures
    // (ou d'un job annulé qui ne s'arrêtait pas) — le code neuf ne montait
    // jamais.
    vi.useFakeTimers();
    const log = vi.fn();
    const drain = startWorkerDrain({ timeoutMs: 60_000, log });
    expect(drain.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(drain.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(drain.signal.aborted).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/60 ?s/));
  });

  it("does nothing once the jobs finished on their own", async () => {
    vi.useFakeTimers();
    const log = vi.fn();
    const drain = startWorkerDrain({ timeoutMs: 60_000, log });
    drain.settle();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(drain.signal.aborted).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });
});
