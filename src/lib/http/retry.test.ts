import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isRetryableError, retry, retryAfterMs } from "./retry";

describe("isRetryableError", () => {
  it("retries network failures and 5xx responses", () => {
    expect(isRetryableError(new axios.AxiosError("timeout"))).toBe(true);
    expect(
      isRetryableError(
        new axios.AxiosError("server", undefined, undefined, undefined, {
          status: 503,
          statusText: "Service Unavailable",
          headers: {},
          config: {} as never,
          data: {},
        }),
      ),
    ).toBe(true);
  });

  it("does not retry quota responses", () => {
    for (const status of [429, 430]) {
      expect(
        isRetryableError(
          new axios.AxiosError("quota", undefined, undefined, undefined, {
            status,
            statusText: "Too Many Requests",
            headers: {},
            config: {} as never,
            data: {},
          }),
        ),
      ).toBe(false);
    }
  });
});

describe("retryAfterMs", () => {
  function quotaError(headers: Record<string, string>) {
    return new axios.AxiosError("quota", undefined, undefined, undefined, {
      status: 503,
      statusText: "Service Unavailable",
      headers,
      config: {} as never,
      data: {},
    });
  }

  it("parses seconds", () => {
    expect(retryAfterMs(quotaError({ "retry-after": "2" }))).toBe(2000);
  });

  it("parses an HTTP date", () => {
    const at = new Date(Date.now() + 30_000).toUTCString();
    const ms = retryAfterMs(quotaError({ "retry-after": at }));
    expect(ms).toBeGreaterThan(25_000);
    expect(ms).toBeLessThanOrEqual(30_000);
  });

  it("caps absurd values", () => {
    expect(retryAfterMs(quotaError({ "retry-after": "3600" }))).toBe(60_000);
  });

  it("returns null when absent, invalid, or not axios", () => {
    expect(retryAfterMs(quotaError({}))).toBeNull();
    expect(retryAfterMs(quotaError({ "retry-after": "bientôt" }))).toBeNull();
    expect(retryAfterMs(new Error("network"))).toBeNull();
  });
});

describe("retry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies full jitter: the wait never exceeds the attempt cap", async () => {
    vi.useFakeTimers();
    try {
      const random = vi.spyOn(Math, "random").mockReturnValue(1);
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new axios.AxiosError("network"))
        .mockResolvedValue("ok");

      const promise = retry(fn, 3, 100);
      await vi.advanceTimersByTimeAsync(99);
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
      expect(random).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors Retry-After as a floor over the computed backoff", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(Math, "random").mockReturnValue(0);
      const fn = vi
        .fn()
        .mockRejectedValueOnce(
          new axios.AxiosError("busy", undefined, undefined, undefined, {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "retry-after": "2" },
            config: {} as never,
            data: {},
          }),
        )
        .mockResolvedValue("ok");

      const promise = retry(fn, 2, 100);
      await vi.advanceTimersByTimeAsync(1999);
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toBe("ok");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry 430 quota errors", async () => {
    const fn = vi.fn().mockRejectedValue(
      new axios.AxiosError("quota", undefined, undefined, undefined, {
        status: 430,
        statusText: "Quota",
        headers: {},
        config: {} as never,
        data: {},
      }),
    );

    await expect(retry(fn, 3, 1)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry a cancelled request", async () => {
    const cancelled = new axios.AxiosError("canceled", "ERR_CANCELED");
    const fn = vi.fn().mockRejectedValue(cancelled);

    await expect(retry(fn, 5, 1)).rejects.toBe(cancelled);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("bails immediately when the signal is already aborted", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const controller = new AbortController();
    controller.abort();

    await expect(retry(fn, 5, 1, controller.signal)).rejects.toThrow(
      /aborted/i,
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("stops retrying once the signal aborts during backoff", async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new axios.AxiosError("network"));

    const promise = retry(fn, 5, 20, controller.signal);
    // Let the first attempt fail and enter the backoff delay, then abort.
    await Promise.resolve();
    controller.abort();

    await expect(promise).rejects.toThrow(/aborted/i);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
