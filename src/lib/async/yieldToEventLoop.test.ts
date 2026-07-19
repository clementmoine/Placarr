import { describe, expect, it, vi } from "vitest";

import { yieldToEventLoop } from "./yieldToEventLoop";

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
