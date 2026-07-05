import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isRawgQuotaBlocked,
  markRawgQuotaHit,
  resetRawgQuotaBlockForTests,
} from "./quota";

describe("rawg quota", () => {
  afterEach(() => {
    resetRawgQuotaBlockForTests();
    vi.useRealTimers();
  });

  it("blocks API calls after a rate-limit hit", () => {
    vi.useFakeTimers();
    markRawgQuotaHit({ rateLimited: true });
    expect(isRawgQuotaBlocked()).toBe(true);
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(isRawgQuotaBlocked()).toBe(false);
  });

  it("uses a longer cooldown for auth failures", () => {
    vi.useFakeTimers();
    markRawgQuotaHit({ authFailure: true });
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(isRawgQuotaBlocked()).toBe(true);
    vi.advanceTimersByTime(40 * 60 * 1000);
    expect(isRawgQuotaBlocked()).toBe(false);
  });
});
