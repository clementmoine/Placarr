import { describe, expect, it } from "vitest";

import { AsyncQueue } from "./asyncQueue";

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
