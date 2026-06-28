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
    const fn = vi
      .fn()
      .mockRejectedValue(
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
});
