import axios from "axios";
import { describe, expect, it, vi } from "vitest";

import { isRetryableError, retry } from "./retry";

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

describe("retry", () => {
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
