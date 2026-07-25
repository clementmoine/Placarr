import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: { get: vi.fn() },
}));

import axios from "axios";

import {
  HTTP_DEFAULT_TIMEOUT_MS,
  httpClientStats,
  httpGet,
  resetHttpClient,
} from "./httpClient";

const mockedGet = vi.mocked(axios.get);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function response(data: unknown, status = 200) {
  return { status, data, headers: {}, config: {}, statusText: "OK" };
}

describe("httpGet", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    resetHttpClient();
  });

  afterEach(() => {
    resetHttpClient();
  });

  it("applies the default timeout when the caller does not set one", async () => {
    mockedGet.mockResolvedValue(response("<html>"));

    await httpGet("https://example.test/a");

    expect(mockedGet).toHaveBeenCalledWith(
      "https://example.test/a",
      expect.objectContaining({ timeout: HTTP_DEFAULT_TIMEOUT_MS }),
    );
  });

  it("keeps an explicit timeout", async () => {
    mockedGet.mockResolvedValue(response("<html>"));

    await httpGet("https://example.test/a", { timeout: 45_000 });

    expect(mockedGet).toHaveBeenCalledWith(
      "https://example.test/a",
      expect.objectContaining({ timeout: 45_000 }),
    );
  });

  it("serves concurrent identical GETs from a single request", async () => {
    const first = deferred<ReturnType<typeof response>>();
    mockedGet.mockReturnValueOnce(first.promise);

    const a = httpGet("https://example.test/search?q=hades");
    const b = httpGet("https://example.test/search?q=hades");
    first.resolve(response("rows"));

    expect((await a).data).toBe("rows");
    expect((await b).data).toBe("rows");
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(httpClientStats()).toMatchObject({ requests: 1, dedupHits: 1 });
  });

  it("does not join requests that differ by headers", async () => {
    mockedGet.mockResolvedValue(response("rows"));

    await Promise.all([
      httpGet("https://example.test/a", { headers: { "X-Key": "one" } }),
      httpGet("https://example.test/a", { headers: { "X-Key": "two" } }),
    ]);

    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("replays a cached response inside the TTL, then refetches", async () => {
    mockedGet.mockResolvedValue(response("rows"));

    await httpGet("https://example.test/a", { cacheTtlMs: 60_000 });
    await httpGet("https://example.test/a", { cacheTtlMs: 60_000 });
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(httpClientStats().cacheHits).toBe(1);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 61_000);
      await httpGet("https://example.test/a", { cacheTtlMs: 60_000 });
    } finally {
      vi.useRealTimers();
    }
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("never caches or joins a stream response", async () => {
    mockedGet.mockResolvedValue(response("stream"));

    await httpGet("https://example.test/sitemap.xml", {
      responseType: "stream",
      cacheTtlMs: 60_000,
    });
    await httpGet("https://example.test/sitemap.xml", {
      responseType: "stream",
      cacheTtlMs: 60_000,
    });

    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("aborting one caller leaves the shared request alive for the others", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    mockedGet.mockReturnValueOnce(pending.promise);

    const leaving = new AbortController();
    const staying = httpGet("https://example.test/a");
    const abandoned = httpGet("https://example.test/a", {
      signal: leaving.signal,
    });
    const abandonedResult = abandoned.catch((error: Error) => error.name);

    leaving.abort();
    expect(await abandonedResult).toBe("AbortError");

    pending.resolve(response("rows"));
    expect((await staying).data).toBe("rows");
  });

  it("aborts the socket once the last waiter leaves", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    let sharedSignal: AbortSignal | undefined;
    mockedGet.mockImplementationOnce((_url, config) => {
      sharedSignal = (config as { signal?: AbortSignal })?.signal;
      return pending.promise;
    });

    const controller = new AbortController();
    const request = httpGet("https://example.test/a", {
      signal: controller.signal,
    });
    const outcome = request.catch((error: Error) => error.name);

    controller.abort();

    expect(await outcome).toBe("AbortError");
    expect(sharedSignal?.aborted).toBe(true);
  });

  it("rejects immediately when the caller signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      httpGet("https://example.test/a", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
