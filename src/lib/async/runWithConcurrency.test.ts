import { describe, expect, it, vi } from "vitest";

import { runWithConcurrency } from "./runWithConcurrency";

describe("runWithConcurrency", () => {
  it("preserves result order", async () => {
    const results = await runWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      await new Promise((resolve) =>
        setTimeout(resolve, value % 2 === 0 ? 5 : 0),
      );
      return value * 2;
    });

    expect(results).toEqual([2, 4, 6, 8]);
  });

  it("limits active workers", async () => {
    let active = 0;
    let maxActive = 0;

    await runWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return null;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("returns an empty array for no items", async () => {
    const worker = vi.fn(async () => 1);
    await expect(runWithConcurrency([], 2, worker)).resolves.toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });
});
