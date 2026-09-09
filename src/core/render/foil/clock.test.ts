import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  foilClockSeconds,
  foilClockSubscriberCount,
  resetFoilClock,
  subscribeFoilFrame,
} from "./clock";

/** Drives rAF by hand so a frame is something the test decides, not the host. */
function stubRaf() {
  const pending: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending.push(cb);
    return pending.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  return {
    get queued() {
      return pending.length;
    },
    /** Run exactly one queued frame. */
    step() {
      const cb = pending.shift();
      cb?.(0);
    },
  };
}

let clock = 0;

beforeEach(() => {
  clock = 1000;
  resetFoilClock(() => clock);
});

afterEach(() => {
  resetFoilClock();
  vi.unstubAllGlobals();
});

describe("foilClock", () => {
  it("drives every subscriber from a single frame", () => {
    const raf = stubRaf();
    const a = vi.fn();
    const b = vi.fn();
    subscribeFoilFrame(a);
    subscribeFoilFrame(b);

    // The point of the file: ten cards used to queue ten callbacks a frame.
    expect(raf.queued).toBe(1);

    raf.step();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("gives every subscriber the same time", () => {
    const raf = stubRaf();
    const seen: number[] = [];
    subscribeFoilFrame((s) => seen.push(s));
    // Subscribing later must not restart the clock — that was the phase bug:
    // a card scrolled into view seconds later shimmered out of step.
    clock = 4000;
    subscribeFoilFrame((s) => seen.push(s));

    raf.step();
    expect(seen).toEqual([3, 3]);
  });

  it("keeps ticking as long as one subscriber remains", () => {
    const raf = stubRaf();
    const stop = subscribeFoilFrame(vi.fn());
    subscribeFoilFrame(vi.fn());

    raf.step();
    stop();
    expect(raf.queued).toBeGreaterThan(0);
  });

  it("stops when the last subscriber leaves", () => {
    const raf = stubRaf();
    const stop = subscribeFoilFrame(vi.fn());
    raf.step();
    stop();
    raf.step();

    expect(raf.queued).toBe(0);
    expect(foilClockSubscriberCount()).toBe(0);
  });

  it("survives a subscriber that unsubscribes mid-tick", () => {
    const raf = stubRaf();
    const other = vi.fn();
    const stop = subscribeFoilFrame(() => stop());
    subscribeFoilFrame(other);

    expect(() => raf.step()).not.toThrow();
    expect(other).toHaveBeenCalledTimes(1);
  });

  it("reports seconds from the shared origin, and zero before it starts", () => {
    expect(foilClockSeconds()).toBe(0);
    stubRaf();
    subscribeFoilFrame(vi.fn());
    clock = 3500;
    expect(foilClockSeconds()).toBe(2.5);
  });
});
