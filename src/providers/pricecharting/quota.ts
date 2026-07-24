const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;

let quotaBlockedUntil = 0;

export class PriceChartingRateLimitedError extends Error {
  constructor() {
    super("PriceCharting rate limited");
    this.name = "PriceChartingRateLimitedError";
  }
}

export function markPriceChartingQuotaHit(): void {
  quotaBlockedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
}

export function isPriceChartingQuotaBlocked(): boolean {
  return Date.now() < quotaBlockedUntil;
}

export function resetPriceChartingQuotaBlockForTests(): void {
  quotaBlockedUntil = 0;
}
