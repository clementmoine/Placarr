import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isPriceChartingQuotaBlocked,
  markPriceChartingQuotaHit,
  resetPriceChartingQuotaBlockForTests,
} from "./quota";

describe("priceCharting quota", () => {
  afterEach(() => {
    resetPriceChartingQuotaBlockForTests();
    vi.useRealTimers();
  });

  it("blocks further calls for ten minutes after a rate-limit hit", () => {
    vi.useFakeTimers();
    markPriceChartingQuotaHit();
    expect(isPriceChartingQuotaBlocked()).toBe(true);
    vi.advanceTimersByTime(10 * 60 * 1000 - 1);
    expect(isPriceChartingQuotaBlocked()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isPriceChartingQuotaBlocked()).toBe(false);
  });
});
