import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HOST_LIMITER_PROFILES,
  hostKeyOf,
  resetHostLimiterForTests,
  waitForHostSlot,
} from "./hostLimiter";

describe("hostKeyOf", () => {
  it("keys on the URL host, port included", () => {
    expect(hostKeyOf("https://shop.test:8443/a?x=1")).toBe("shop.test:8443");
    expect(hostKeyOf("https://shop.test/a")).toBe("shop.test");
  });

  it("falls back to the raw string for non-URLs", () => {
    expect(hostKeyOf("not-a-url")).toBe("not-a-url");
  });
});

describe("waitForHostSlot", () => {
  beforeEach(() => {
    resetHostLimiterForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetHostLimiterForTests();
  });

  it("lets the first call through immediately", async () => {
    await waitForHostSlot("https://a.test/x", { minIntervalMs: 1_000 });
    // Résolu sans toucher aux timers.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("spaces two calls to the same host by the interval", async () => {
    await waitForHostSlot("https://a.test/x", { minIntervalMs: 1_000 });

    let done = false;
    const second = waitForHostSlot("https://a.test/y", {
      minIntervalMs: 1_000,
    }).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(done).toBe(true);
  });

  it("spaces concurrent calls: three slots land one interval apart", async () => {
    const starts: number[] = [];
    const t0 = Date.now();
    const take = async () => {
      await waitForHostSlot("https://a.test/x", { minIntervalMs: 500 });
      starts.push(Date.now() - t0);
    };

    const pending = Promise.all([take(), take(), take()]);
    await vi.advanceTimersByTimeAsync(1_000);
    await pending;

    expect(starts).toEqual([0, 500, 1_000]);
  });

  it("does not serialize different hosts", async () => {
    await waitForHostSlot("https://a.test/x", { minIntervalMs: 1_000 });

    let done = false;
    const other = waitForHostSlot("https://b.test/x", {
      minIntervalMs: 1_000,
    }).then(() => {
      done = true;
    });
    await other;
    expect(done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("applies the scrape profile by default when asked", async () => {
    await waitForHostSlot("https://a.test/x", { profile: "scrape" });

    let done = false;
    const second = waitForHostSlot("https://a.test/y", {
      profile: "scrape",
    }).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(HOST_LIMITER_PROFILES.scrape - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(done).toBe(true);
  });

  it("minIntervalMs: 0 bypasses the limiter entirely", async () => {
    await waitForHostSlot("https://a.test/x", { minIntervalMs: 5_000 });
    await waitForHostSlot("https://a.test/y", { minIntervalMs: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an aborted wait frees the chain for the next caller", async () => {
    await waitForHostSlot("https://a.test/x", { minIntervalMs: 1_000 });

    const controller = new AbortController();
    const aborted = waitForHostSlot("https://a.test/y", {
      minIntervalMs: 1_000,
      signal: controller.signal,
    });
    const outcome = aborted.catch((error: Error) => error.name);
    controller.abort();
    expect(await outcome).toBe("AbortError");

    // Le créneau mort ne retarde pas l'appel suivant.
    let done = false;
    const next = waitForHostSlot("https://a.test/z", {
      minIntervalMs: 1_000,
    }).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await next;
    expect(done).toBe(true);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    await waitForHostSlot("https://a.test/x", { minIntervalMs: 1_000 });
    const controller = new AbortController();
    controller.abort();

    await expect(
      waitForHostSlot("https://a.test/y", {
        minIntervalMs: 1_000,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
