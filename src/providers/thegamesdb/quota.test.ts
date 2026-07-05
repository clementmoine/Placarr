import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isTheGamesDbQuotaBlocked,
  markTheGamesDbQuotaHit,
  resetTheGamesDbQuotaBlockForTests,
} from "./quota";

describe("thegamesdb quota", () => {
  afterEach(() => {
    resetTheGamesDbQuotaBlockForTests();
    vi.useRealTimers();
  });

  it("blocks API calls after a monthly quota hit", () => {
    vi.useFakeTimers();
    expect(isTheGamesDbQuotaBlocked()).toBe(false);

    markTheGamesDbQuotaHit({ monthlyExhausted: true });
    expect(isTheGamesDbQuotaBlocked()).toBe(true);

    vi.advanceTimersByTime(12 * 60 * 60 * 1000);
    expect(isTheGamesDbQuotaBlocked()).toBe(false);
  });
});
