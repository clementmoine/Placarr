import { describe, expect, it } from "vitest";

import {
  effectsRegistered,
  ensureEffects,
  markEffectsRegistered,
  subscribeEffectsReady,
} from "./ensureEffects";

describe("ensureEffects", () => {
  it("notifies subscribers when packs are marked registered", async () => {
    let ticks = 0;
    const stop = subscribeEffectsReady(() => {
      ticks += 1;
    });
    markEffectsRegistered();
    expect(effectsRegistered()).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(1);
    stop();
    await expect(ensureEffects()).resolves.toBeUndefined();
  });
});
