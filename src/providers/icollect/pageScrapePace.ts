import axios from "axios";

export type ICollectFetchErrorKind = "rate_limited" | "transient" | "fatal";

export type PageScrapePaceConfig = {
  baseDelayMs: number;
  minDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  recoveryFactor: number;
  successesBeforeRecovery: number;
  /** First inter-request delay after a rate limit when we were running at zero. */
  rateLimitFloorMs: number;
  /** Whether timeouts/5xx should insert a pause between requests. */
  throttleOnTransient: boolean;
};

/** Full speed between requests — only rate limits apply brakes. */
export const PAGE_SCRAPE_PACE: PageScrapePaceConfig = {
  baseDelayMs: 0,
  minDelayMs: 0,
  maxDelayMs: 5 * 60 * 1000,
  backoffFactor: 2,
  recoveryFactor: 0.85,
  successesBeforeRecovery: 12,
  rateLimitFloorMs: 5_000,
  throttleOnTransient: false,
};

/** @deprecated use PAGE_SCRAPE_PACE */
export const FILL_PAGE_SCRAPE_PACE = PAGE_SCRAPE_PACE;

/** @deprecated use PAGE_SCRAPE_PACE */
export const DEFAULT_PAGE_SCRAPE_PACE = PAGE_SCRAPE_PACE;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

export function classifyICollectFetchError(
  error: unknown,
): ICollectFetchErrorKind {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 429 || status === 403) return "rate_limited";
    if (status === 503 || status === 502 || status === 504) return "transient";
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return "transient";
    }
  }
  return "fatal";
}

export function readICollectRetryAfterMs(error: unknown): number | null {
  if (!axios.isAxiosError(error)) return null;
  const header =
    error.response?.headers?.["retry-after"] ??
    error.response?.headers?.["Retry-After"];
  return parseRetryAfterMs(header);
}

export class PageScrapePace {
  private delayMs: number;
  private successStreak = 0;

  constructor(
    private readonly config: PageScrapePaceConfig = PAGE_SCRAPE_PACE,
    initialDelayMs?: number,
  ) {
    this.delayMs = initialDelayMs ?? config.baseDelayMs;
  }

  currentDelayMs(): number {
    return this.delayMs;
  }

  shouldWaitAfterTransient(): boolean {
    return this.config.throttleOnTransient && this.delayMs > 0;
  }

  onSuccess(): void {
    if (this.delayMs <= this.config.minDelayMs) {
      this.delayMs = this.config.minDelayMs;
      return;
    }
    this.successStreak += 1;
    if (this.successStreak < this.config.successesBeforeRecovery) return;
    this.successStreak = 0;
    this.delayMs = Math.max(
      this.config.minDelayMs,
      Math.floor(this.delayMs * this.config.recoveryFactor),
    );
  }

  onRateLimited(retryAfterMs?: number | null): number {
    this.successStreak = 0;
    if (retryAfterMs && retryAfterMs > 0) {
      this.delayMs = Math.min(this.config.maxDelayMs, retryAfterMs);
      return this.delayMs;
    }
    const nextDelay =
      this.delayMs <= this.config.minDelayMs
        ? this.config.rateLimitFloorMs
        : this.delayMs * this.config.backoffFactor;
    this.delayMs = Math.min(
      this.config.maxDelayMs,
      Math.max(this.config.minDelayMs, nextDelay),
    );
    return this.delayMs;
  }

  onTransientError(): number {
    if (!this.config.throttleOnTransient) {
      return this.delayMs;
    }
    this.successStreak = 0;
    const nextDelay =
      this.delayMs <= this.config.minDelayMs
        ? this.config.baseDelayMs
        : Math.ceil(this.delayMs * 1.5);
    this.delayMs = Math.min(
      this.config.maxDelayMs,
      Math.max(this.config.minDelayMs, nextDelay),
    );
    return this.delayMs;
  }

  async wait(): Promise<void> {
    if (this.delayMs > 0) await sleep(this.delayMs);
  }
}
