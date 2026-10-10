import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn(),
  flareSolverrCookiesFor: vi.fn(),
}));

import {
  flareSolverrCookiesFor,
  flareSolverrRequestGet,
} from "@/lib/http/flareSolverr";

import {
  type ChallengeSolver,
  flareSolverrChallengeSolver,
  getChallengeSolver,
  setChallengeSolver,
} from "./challengeSolver";

const mockedRequestGet = vi.mocked(flareSolverrRequestGet);
const mockedCookiesFor = vi.mocked(flareSolverrCookiesFor);

describe("flareSolverrChallengeSolver (défaut)", () => {
  beforeEach(() => {
    mockedRequestGet.mockReset();
    mockedCookiesFor.mockReset();
    setChallengeSolver(null);
  });

  afterEach(() => {
    setChallengeSolver(null);
  });

  it("delegates fetchHtml to flareSolverrRequestGet, options included", async () => {
    mockedRequestGet.mockResolvedValueOnce("<html/>");
    const controller = new AbortController();

    const body = await getChallengeSolver().fetchHtml("https://shop.test/p", {
      maxTimeoutMs: 12_000,
      signal: controller.signal,
    });

    expect(body).toBe("<html/>");
    expect(mockedRequestGet).toHaveBeenCalledWith("https://shop.test/p", {
      maxTimeoutMs: 12_000,
      signal: controller.signal,
    });
  });

  it("delegates fetchCookies to flareSolverrCookiesFor", async () => {
    mockedCookiesFor.mockResolvedValueOnce({
      cookie: "cf_clearance=abc",
      userAgent: "Mozilla/5.0",
    });

    const cookies = await getChallengeSolver().fetchCookies(
      "https://shop.test/",
      { maxTimeoutMs: 5_000 },
    );

    expect(cookies).toEqual({
      cookie: "cf_clearance=abc",
      userAgent: "Mozilla/5.0",
    });
    expect(mockedCookiesFor).toHaveBeenCalledWith(
      "https://shop.test/",
      5_000,
      undefined,
    );
  });
});

describe("setChallengeSolver", () => {
  afterEach(() => {
    setChallengeSolver(null);
  });

  it("swaps the active solver — a replacement touches only this wiring", async () => {
    const substitute: ChallengeSolver = {
      fetchHtml: vi.fn().mockResolvedValue("<byparr/>"),
      fetchCookies: vi.fn().mockResolvedValue(null),
    };
    setChallengeSolver(substitute);

    expect(getChallengeSolver()).toBe(substitute);
    expect(await getChallengeSolver().fetchHtml("https://shop.test/p")).toBe(
      "<byparr/>",
    );
    expect(mockedRequestGet).not.toHaveBeenCalled();
  });

  it("restores the FlareSolverr default on null", () => {
    setChallengeSolver({
      fetchHtml: vi.fn(),
      fetchCookies: vi.fn(),
    });
    setChallengeSolver(null);

    expect(getChallengeSolver()).toBe(flareSolverrChallengeSolver);
  });
});
