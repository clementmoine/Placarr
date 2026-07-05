import { describe, expect, it } from "vitest";

import {
  PAGE_SCRAPE_PACE,
  PageScrapePace,
  classifyICollectFetchError,
  readICollectRetryAfterMs,
} from "./pageScrapePace";
import { AxiosError } from "axios";

describe("classifyICollectFetchError", () => {
  it("detects rate-limit responses", () => {
    const error = new AxiosError(
      "Too Many Requests",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 429,
        statusText: "Too Many Requests",
        headers: {},
        config: {} as never,
        data: "",
      },
    );
    expect(classifyICollectFetchError(error)).toBe("rate_limited");
  });

  it("detects transient timeouts", () => {
    const error = new AxiosError("timeout", "ETIMEDOUT");
    expect(classifyICollectFetchError(error)).toBe("transient");
  });
});

describe("readICollectRetryAfterMs", () => {
  it("parses Retry-After seconds", () => {
    const error = new AxiosError(
      "Too Many Requests",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "retry-after": "120" },
        config: {} as never,
        data: "",
      },
    );
    expect(readICollectRetryAfterMs(error)).toBe(120_000);
  });
});

describe("PageScrapePace", () => {
  it("runs at zero delay until rate limited", async () => {
    const pace = new PageScrapePace(PAGE_SCRAPE_PACE, 0);
    const started = Date.now();
    pace.onSuccess();
    pace.onSuccess();
    await pace.wait();
    expect(Date.now() - started).toBeLessThan(20);
    expect(pace.currentDelayMs()).toBe(0);
  });

  it("backs off from zero only after a rate limit", () => {
    const pace = new PageScrapePace(PAGE_SCRAPE_PACE, 0);
    expect(pace.onRateLimited()).toBe(PAGE_SCRAPE_PACE.rateLimitFloorMs);
    expect(pace.onRateLimited()).toBe(
      PAGE_SCRAPE_PACE.rateLimitFloorMs * PAGE_SCRAPE_PACE.backoffFactor,
    );
  });

  it("does not throttle transient errors in fill mode", () => {
    const pace = new PageScrapePace(PAGE_SCRAPE_PACE, 0);
    pace.onTransientError();
    expect(pace.currentDelayMs()).toBe(0);
    expect(pace.shouldWaitAfterTransient()).toBe(false);
  });

  it("honors Retry-After when provided", () => {
    const pace = new PageScrapePace();
    expect(pace.onRateLimited(30_000)).toBe(30_000);
  });
});
