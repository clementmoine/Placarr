import { describe, expect, it, vi } from "vitest";

import {
  AsyncQueue,
  runWithConcurrency,
  yieldToEventLoop,
} from "./async";

describe("AsyncQueue priority", () => {
  it("runs high-priority tasks before queued normal tasks", async () => {
    const queue = new AsyncQueue(1);
    const order: string[] = [];

    const blocking = queue.run(async () => {
      order.push("block-start");
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push("block-end");
      return "block";
    }, "normal");

    const normal = queue.run(async () => {
      order.push("normal");
      return "normal";
    }, "normal");

    await new Promise((resolve) => setTimeout(resolve, 5));

    const high = queue.run(async () => {
      order.push("high");
      return "high";
    }, "high");

    await Promise.all([blocking, normal, high]);
    expect(order).toEqual(["block-start", "block-end", "high", "normal"]);
  });
});

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

describe("yieldToEventLoop", () => {
  it("resolves on a later event-loop turn", async () => {
    let turned = false;
    const pending = yieldToEventLoop().then(() => {
      expect(turned).toBe(true);
    });
    turned = true;
    await pending;
  });

  it("does not block the calling turn", () => {
    const spy = vi.fn();
    void yieldToEventLoop().then(spy);
    expect(spy).not.toHaveBeenCalled();
  });
});
