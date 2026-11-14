import { beforeEach, describe, expect, it } from "vitest";

import {
  resetServerOrtExclusiveForTests,
  runServerOrtExclusive,
} from "@/lib/server/ortExclusive";

describe("runServerOrtExclusive", () => {
  beforeEach(() => resetServerOrtExclusiveForTests());

  it("never lets two native ORT jobs overlap", async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const job = (label: string, ms: number) => async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`${label}:start`);
      await new Promise((r) => setTimeout(r, ms));
      active -= 1;
      order.push(`${label}:end`);
      return label;
    };

    const results = await Promise.all([
      runServerOrtExclusive(job("embed", 30)),
      runServerOrtExclusive(job("ocr", 5)),
      runServerOrtExclusive(job("embed2", 10)),
    ]);

    expect(maxActive).toBe(1);
    expect(results).toEqual(["embed", "ocr", "embed2"]);
    expect(order).toEqual([
      "embed:start",
      "embed:end",
      "ocr:start",
      "ocr:end",
      "embed2:start",
      "embed2:end",
    ]);
  });

  it("a rejected run does not block the next", async () => {
    await expect(
      runServerOrtExclusive(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    await expect(runServerOrtExclusive(async () => 42)).resolves.toBe(42);
  });
});
