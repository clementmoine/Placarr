import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: { get: vi.fn() },
}));

vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn(),
}));

import { flareSolverrRequestGet } from "@/lib/http/flareSolverr";
import { resetCircuitBreakersForTests } from "@/lib/http/circuitBreaker";
import { resetHostLimiterForTests } from "@/lib/http/hostLimiter";
import { fetchGetWithFlareFallback, scrapeAccessBlocked } from "./scrapeFetch";

const mockedGet = vi.mocked(axios.get);
const mockedFlare = vi.mocked(flareSolverrRequestGet);

beforeEach(() => {
  mockedGet.mockReset();
  mockedFlare.mockReset();
  resetHostLimiterForTests();
  resetCircuitBreakersForTests();
});

describe("scrapeAccessBlocked", () => {
  it("detects permission pages and HTTP 403", () => {
    expect(scrapeAccessBlocked(403, "")).toBe(true);
    expect(
      scrapeAccessBlocked(
        200,
        "Oops! It seems you don't have permission to view this page.",
      ),
    ).toBe(true);
    expect(scrapeAccessBlocked(200, '{"rendered_products":"<div/>"}')).toBe(
      false,
    );
  });
});

describe("fetchGetWithFlareFallback", () => {
  it("returns direct response when successful", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: { ok: true },
    });

    const result = await fetchGetWithFlareFallback("https://shop.test/search");

    expect(result).toEqual({
      status: 200,
      data: { ok: true },
      viaFlareSolverr: false,
      responseUrl: "https://shop.test/search",
    });
    expect(mockedFlare).not.toHaveBeenCalled();
  });

  it("retries via FlareSolverr after HTTP 403", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 403,
      data: "Forbidden",
    });
    mockedFlare.mockResolvedValueOnce('{"rendered_products":"<div/>"}');

    const result = await fetchGetWithFlareFallback("https://shop.test/search", {
      validateStatus: (status) => status >= 200 && status < 500,
    });

    expect(result.viaFlareSolverr).toBe(true);
    expect(result.data).toEqual({ rendered_products: "<div/>" });
    expect(mockedFlare).toHaveBeenCalledOnce();
  });

  it("keeps blocked direct response when FlareSolverr also fails", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 403,
      data: "Forbidden",
    });
    mockedFlare.mockResolvedValueOnce(null);

    const result = await fetchGetWithFlareFallback("https://shop.test/search", {
      validateStatus: (status) => status >= 200 && status < 500,
    });

    expect(result).toEqual({
      status: 403,
      data: "Forbidden",
      viaFlareSolverr: false,
    });
  });

  it("opens the host breaker on a blocked response and short-circuits the next direct call", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 403,
      data: "Forbidden",
    });
    mockedFlare.mockResolvedValue("<html><body>ok</body></html>");

    await fetchGetWithFlareFallback("https://shop.test/search");
    expect(mockedGet).toHaveBeenCalledTimes(1);

    // Breaker ouvert : l'appel direct est court-circuité, le solver prend le relais.
    const second = await fetchGetWithFlareFallback("https://shop.test/other");
    expect(second.viaFlareSolverr).toBe(true);
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedFlare).toHaveBeenCalledTimes(2);
  });

  it("does not open the breaker on an honest miss (404)", async () => {
    mockedGet.mockResolvedValue({ status: 404, data: "Not Found" });
    mockedFlare.mockResolvedValue(null);

    await fetchGetWithFlareFallback("https://shop.test/a", {
      validateStatus: (status) => status === 200,
    });
    await fetchGetWithFlareFallback("https://shop.test/b", {
      validateStatus: (status) => status === 200,
    });

    // Le host répond franchement : pas de court-circuit.
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("paces direct calls to the same host through the scrape profile", async () => {
    vi.useFakeTimers();
    try {
      const startedAt: number[] = [];
      mockedGet.mockImplementation(async () => {
        startedAt.push(Date.now());
        return { status: 200, data: "ok" };
      });

      const t0 = Date.now();
      await fetchGetWithFlareFallback("https://paced.test/a");
      const second = fetchGetWithFlareFallback("https://paced.test/b");

      await vi.advanceTimersByTimeAsync(999);
      expect(startedAt).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await second;

      expect(startedAt.map((at) => at - t0)).toEqual([0, 1_000]);
    } finally {
      vi.useRealTimers();
    }
  });
});
