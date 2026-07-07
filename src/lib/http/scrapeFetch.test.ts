import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: { get: vi.fn() },
}));

vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn(),
}));

import { flareSolverrRequestGet } from "@/lib/http/flareSolverr";
import { fetchGetWithFlareFallback, scrapeAccessBlocked } from "./scrapeFetch";

const mockedGet = vi.mocked(axios.get);
const mockedFlare = vi.mocked(flareSolverrRequestGet);

beforeEach(() => {
  mockedGet.mockReset();
  mockedFlare.mockReset();
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
});
