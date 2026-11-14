import axios from "axios";
import { describe, expect, it, vi } from "vitest";

import { softRetryNull } from "./softRetry";

describe("softRetryNull", () => {
  it("retries transient network errors then returns the value", async () => {
    const reset = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(reset)
      .mockResolvedValueOnce(Buffer.from("ok"));
    const hit = await softRetryNull(fn, 3, 1);
    expect(hit?.toString()).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("returns null on non-retryable 404 without looping forever", async () => {
    const notFound = new axios.AxiosError(
      "missing",
      undefined,
      undefined,
      undefined,
      {
        status: 404,
        statusText: "Not Found",
        headers: {},
        config: {} as never,
        data: {},
      },
    );
    const fn = vi.fn().mockRejectedValue(notFound);
    expect(await softRetryNull(fn, 5, 1)).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns null when the producer soft-skips", async () => {
    expect(await softRetryNull(async () => null, 3, 1)).toBeNull();
  });
});
