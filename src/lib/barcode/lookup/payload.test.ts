import { afterEach, describe, expect, it } from "vitest";

import {
  resolveSettledLookups,
  withBarcodeLookupDeadline,
} from "./payload";

const delay = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

afterEach(() => {
  delete process.env.BARCODE_LOOKUP_TASK_DEADLINE_MS;
});

describe("withBarcodeLookupDeadline", () => {
  it("resolves the task value when it finishes before the deadline", async () => {
    await expect(
      withBarcodeLookupDeadline(delay(5, "fast"), 200),
    ).resolves.toBe("fast");
  });

  it("yields null when the task overruns the deadline", async () => {
    await expect(
      withBarcodeLookupDeadline(delay(200, "slow"), 20),
    ).resolves.toBeNull();
  });

  it("yields null when the task rejects", async () => {
    await expect(
      withBarcodeLookupDeadline(Promise.reject(new Error("boom")), 200),
    ).resolves.toBeNull();
  });

  it("disables the cap when ms is non-positive", async () => {
    await expect(
      withBarcodeLookupDeadline(delay(5, "value"), 0),
    ).resolves.toBe("value");
  });
});

describe("resolveSettledLookups", () => {
  it("caps a stalled task to null without blocking the fast ones", async () => {
    process.env.BARCODE_LOOKUP_TASK_DEADLINE_MS = "30";
    const result = await resolveSettledLookups({
      fast: delay(5, "ok"),
      stalled: new Promise(() => {}),
    });
    expect(result.fast).toBe("ok");
    expect(result.stalled).toBeNull();
  });
});
