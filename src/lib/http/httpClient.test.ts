import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: { get: vi.fn() },
}));

import axios from "axios";

import {
  HTTP_DEFAULT_TIMEOUT_MS,
  HTTP_DEFAULT_USER_AGENT,
  httpClientStats,
  httpGet,
  resetHttpClient,
} from "./httpClient";
import { resetHostLimiterForTests } from "./hostLimiter";
import { resetCircuitBreakersForTests } from "./circuitBreaker";
import { setCircuitPersistenceRoot } from "./circuitPersistence";

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
    resetHostLimiterForTests();
  });

  afterEach(() => {
    resetHttpClient();
    resetHostLimiterForTests();
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

    // Laisse le limiteur par host délivrer son créneau : la requête partagée
    // n'existe qu'après ce saut asynchrone.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedGet).toHaveBeenCalledTimes(1);

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

  it("sends the honest default User-Agent when the caller sets none", async () => {
    mockedGet.mockResolvedValue(response("<html>"));

    await httpGet("https://example.test/a");

    const config = mockedGet.mock.calls[0]?.[1] as {
      headers: Record<string, string>;
    };
    expect(config.headers["User-Agent"]).toBe(HTTP_DEFAULT_USER_AGENT);
  });

  it("keeps a caller-provided User-Agent, whatever its casing", async () => {
    mockedGet.mockResolvedValue(response("<html>"));

    await httpGet("https://example.test/a", {
      headers: { "user-agent": "MyScraper/2.0" },
    });

    const config = mockedGet.mock.calls[0]?.[1] as {
      headers: Record<string, string>;
    };
    expect(config.headers["user-agent"]).toBe("MyScraper/2.0");
    expect(config.headers["User-Agent"]).toBeUndefined();
  });

  it("paces two calls to the same host through the limiter", async () => {
    vi.useFakeTimers();
    try {
      const startedAt: number[] = [];
      mockedGet.mockImplementation(async () => {
        startedAt.push(Date.now());
        return response("rows");
      });

      const t0 = Date.now();
      await httpGet("https://example.test/a", { noDedup: true });
      const second = httpGet("https://example.test/b", { noDedup: true });

      await vi.advanceTimersByTimeAsync(119);
      expect(startedAt).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await second;

      expect(startedAt.map((at) => at - t0)).toEqual([0, 120]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not pace calls to different hosts", async () => {
    mockedGet.mockResolvedValue(response("rows"));

    await httpGet("https://example.test/a", { noDedup: true });
    await httpGet("https://other.test/a", { noDedup: true });

    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});

/** Erreurs axios telles qu'axios les rejette (le mock n'expose pas la classe). */
function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, headers: {}, data: null },
  });
}
function networkError(code = "ECONNRESET") {
  return Object.assign(new Error(code), { isAxiosError: true, code });
}

describe("httpGet — résilience par défaut", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    resetHttpClient();
    resetHostLimiterForTests();
    resetCircuitBreakersForTests();
    setCircuitPersistenceRoot(null);
  });

  afterEach(() => {
    resetHttpClient();
    resetCircuitBreakersForTests();
  });

  it("rejoue une fois une erreur transitoire (5xx, réseau) puis rend la réponse", async () => {
    mockedGet
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce(response("ok"));
    await expect(
      httpGet("https://api.test/a", { minIntervalMs: 0 }),
    ).resolves.toMatchObject({ data: "ok" });

    mockedGet
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(response("ok2"));
    await expect(
      httpGet("https://api.test/b", { minIntervalMs: 0 }),
    ).resolves.toMatchObject({ data: "ok2" });
    expect(mockedGet).toHaveBeenCalledTimes(4);
  });

  it("ne rejoue jamais une erreur définitive ni un quota (404, 429)", async () => {
    mockedGet.mockRejectedValueOnce(httpError(404));
    await expect(
      httpGet("https://api.test/404", { minIntervalMs: 0 }),
    ).rejects.toThrow("HTTP 404");
    mockedGet.mockRejectedValueOnce(httpError(429));
    await expect(
      httpGet("https://api.test/429", { minIntervalMs: 0 }),
    ).rejects.toThrow("HTTP 429");
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("`retries: 1` désactive le rejeu", async () => {
    mockedGet.mockRejectedValueOnce(httpError(502));
    await expect(
      httpGet("https://api.test/once", { minIntervalMs: 0, retries: 1 }),
    ).rejects.toThrow("HTTP 502");
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("ouvre le circuit d'un host après 5 échecs transitoires consécutifs, sans toucher aux autres", async () => {
    mockedGet.mockRejectedValue(httpError(503));
    for (let i = 0; i < 5; i += 1) {
      await expect(
        httpGet(`https://down.test/${i}`, { minIntervalMs: 0, retries: 1 }),
      ).rejects.toThrow("HTTP 503");
    }
    const callsBefore = mockedGet.mock.calls.length;
    await expect(
      httpGet("https://down.test/next", { minIntervalMs: 0 }),
    ).rejects.toMatchObject({ code: "ECIRCUITOPEN" });
    expect(mockedGet.mock.calls.length).toBe(callsBefore);

    mockedGet.mockResolvedValueOnce(response("fine"));
    await expect(
      httpGet("https://up.test/a", { minIntervalMs: 0 }),
    ).resolves.toMatchObject({ data: "fine" });
  });

  it("PLACARR_HTTP_RESILIENCE=off (rejeu déterministe) : ni rejeu ni circuit", async () => {
    vi.stubEnv("PLACARR_HTTP_RESILIENCE", "off");
    try {
      mockedGet.mockRejectedValue(httpError(504));
      for (let i = 0; i < 7; i += 1) {
        await expect(
          httpGet(`https://replay.test/${i}`, { minIntervalMs: 0 }),
        ).rejects.toThrow("HTTP 504");
      }
      // Un appel par requête (pas de rejeu), et jamais de circuit ouvert.
      expect(mockedGet).toHaveBeenCalledTimes(7);
      mockedGet.mockResolvedValueOnce(response("couvert"));
      await expect(
        httpGet("https://replay.test/ok", { minIntervalMs: 0 }),
      ).resolves.toMatchObject({ data: "couvert" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("un succès remet le compteur d'échecs du host à zéro", async () => {
    for (let round = 0; round < 2; round += 1) {
      for (let i = 0; i < 4; i += 1) {
        mockedGet.mockRejectedValueOnce(httpError(500));
        await expect(
          httpGet(`https://flaky.test/${round}-${i}`, {
            minIntervalMs: 0,
            retries: 1,
          }),
        ).rejects.toThrow();
      }
      mockedGet.mockResolvedValueOnce(response("ok"));
      await httpGet(`https://flaky.test/ok-${round}`, { minIntervalMs: 0 });
    }
    mockedGet.mockResolvedValueOnce(response("still closed"));
    await expect(
      httpGet("https://flaky.test/last", { minIntervalMs: 0 }),
    ).resolves.toMatchObject({ data: "still closed" });
  });

  it("laisse le profil `scrape` à son propre circuit (scrapeFetch)", async () => {
    mockedGet.mockRejectedValue(networkError());
    for (let i = 0; i < 6; i += 1) {
      await expect(
        httpGet(`https://shop.test/${i}`, {
          minIntervalMs: 0,
          retries: 1,
          hostProfile: "scrape",
        }),
      ).rejects.toThrow("ECONNRESET");
    }
  });
});
